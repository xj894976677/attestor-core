import type { IncomingMessage, ServerResponse } from 'http'
import { createSession, getSession, updateSessionStatus, submitProof } from '#src/server/session-store.js'
import { logger as LOGGER } from '#src/utils/index.js'

const logger = LOGGER.child({ module: 'session-api' })

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
 * Handle session API requests:
 *   POST /api/sdk/init/session/       — create a new session
 *   POST /api/sdk/update/session/     — update session status
 *   GET  /api/sdk/session/:id         — get session data
 *   POST /session/:id/proof           — submit proof
 */
export async function handleSessionApiRequest(
	req: IncomingMessage,
	res: ServerResponse
) {
	const url = new URL(req.url!, `http://${req.headers.host}`)
	const path = url.pathname
	const method = req.method?.toUpperCase()

	try {
		// POST /api/sdk/init/session/
		if(path === '/api/sdk/init/session/' && method === 'POST') {
			const body = JSON.parse(await readBody(req))
			const { appId, providerId, timestamp, signature } = body

			if(!appId || !providerId) {
				sendJson(res, 400, { error: 'Missing required fields: appId, providerId' })
				return
			}

			const session = createSession(appId, providerId, timestamp || '', signature || '')
			logger.info({ sessionId: session.sessionId, providerId }, 'Session created')
			sendJson(res, 200, {
				sessionId: session.sessionId,
				resolvedProviderVersion: '',
			})
			return
		}

		// POST /api/sdk/update/session/
		if(path === '/api/sdk/update/session/' && method === 'POST') {
			const body = JSON.parse(await readBody(req))
			const { sessionId, status } = body

			if(!sessionId || !status) {
				sendJson(res, 400, { error: 'Missing required fields: sessionId, status' })
				return
			}

			const ok = updateSessionStatus(sessionId, status)
			if(!ok) {
				sendJson(res, 404, { error: `Session '${sessionId}' not found` })
				return
			}

			logger.info({ sessionId, status }, 'Session status updated')
			sendJson(res, 200, { success: true })
			return
		}

		// GET /api/sdk/session/:id
		const sessionMatch = path.match(/^\/api\/sdk\/session\/(.+)$/)
		if(sessionMatch && method === 'GET') {
			const sessionId = decodeURIComponent(sessionMatch[1])
			const session = getSession(sessionId)
			if(!session) {
				sendJson(res, 404, { error: `Session '${sessionId}' not found` })
				return
			}

			sendJson(res, 200, session)
			return
		}

		// POST /session/:id/proof
		const proofMatch = path.match(/^\/session\/(.+)\/proof$/)
		if(proofMatch && method === 'POST') {
			const sessionId = decodeURIComponent(proofMatch[1])
			const body = JSON.parse(await readBody(req))
			const proofs = body.proofs || body

			const ok = submitProof(sessionId, Array.isArray(proofs) ? proofs : [proofs])
			if(!ok) {
				sendJson(res, 404, { error: `Session '${sessionId}' not found` })
				return
			}

			logger.info({ sessionId }, 'Proof submitted')
			sendJson(res, 200, { success: true })
			return
		}

		sendJson(res, 404, { error: 'Not found' })
	} catch(err) {
		logger.error({ err, path, method }, 'Session API error')
		sendJson(res, 500, { error: 'Internal server error' })
	}
}
