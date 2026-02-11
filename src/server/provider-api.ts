import type { IncomingMessage, ServerResponse } from 'http'
import { getProviderList, getProviderById, saveProvider, deleteProvider } from '#src/server/provider-store.js'
import { logger as LOGGER } from '#src/utils/index.js'

const logger = LOGGER.child({ module: 'provider-api' })

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
	res.statusCode = statusCode
	res.setHeader('Content-Type', 'application/json')
	res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on('data', (chunk: Buffer) => chunks.push(chunk))
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
		req.on('error', reject)
	})
}

/**
 * Handle provider API requests:
 *   GET  /api/providers         — list all providers (summary)
 *   GET  /api/providers/:id     — get full provider config
 *   POST /api/providers         — create/update a provider
 *   DELETE /api/providers/:id   — delete a provider
 */
export async function handleProviderApiRequest(
	req: IncomingMessage,
	res: ServerResponse
) {
	const url = new URL(req.url!, `http://${req.headers.host}`)
	const path = url.pathname
	const method = req.method?.toUpperCase()

	try {
		// GET /api/providers
		if(path === '/api/providers' && method === 'GET') {
			const list = getProviderList()
			sendJson(res, 200, { providers: list })
			return
		}

		// Match /api/providers/:id/custom-injection
		const injectionMatch = path.match(/^\/api\/providers\/(.+)\/custom-injection$/)
		if(injectionMatch && method === 'GET') {
			const providerId = decodeURIComponent(injectionMatch[1])
			const provider = getProviderById(providerId)
			if(!provider) {
				sendJson(res, 404, { error: `Provider '${providerId}' not found` })
				return
			}

			if(!provider.customInjection) {
				res.statusCode = 404
				res.setHeader('Content-Type', 'text/plain')
				res.end('No custom injection script for this provider')
				return
			}

			res.statusCode = 200
			res.setHeader('Content-Type', 'text/plain')
			res.end(provider.customInjection)
			return
		}

		// Match /api/providers/:id
		const match = path.match(/^\/api\/providers\/(.+)$/)

		if(match) {
			const providerId = decodeURIComponent(match[1])

			// GET /api/providers/:id
			if(method === 'GET') {
				const provider = getProviderById(providerId)
				if(!provider) {
					sendJson(res, 404, { error: `Provider '${providerId}' not found` })
					return
				}

				sendJson(res, 200, { providers: provider })
				return
			}

			// DELETE /api/providers/:id
			if(method === 'DELETE') {
				const deleted = deleteProvider(providerId)
				if(!deleted) {
					sendJson(res, 404, { error: `Provider '${providerId}' not found` })
					return
				}

				sendJson(res, 200, { message: 'Provider deleted' })
				return
			}
		}

		// POST /api/providers — create or update
		if(path === '/api/providers' && method === 'POST') {
			const body = await readBody(req)
			const provider = JSON.parse(body)
			if(!provider.providerId) {
				sendJson(res, 400, { error: 'Missing required field: providerId' })
				return
			}

			saveProvider(provider)
			sendJson(res, 200, { message: 'Provider saved', providerId: provider.providerId })
			return
		}

		sendJson(res, 404, { error: 'Not found' })
	} catch(err) {
		logger.error({ err, path, method }, 'Provider API error')
		sendJson(res, 500, { error: 'Internal server error' })
	}
}
