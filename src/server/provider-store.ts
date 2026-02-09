import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { logger as LOGGER } from '#src/utils/index.ts'

const logger = LOGGER.child({ module: 'provider-store' })

export interface ProviderConfig {
	id: string
	providerId: string
	httpProviderId: string
	name: string
	description: string
	logoUrl: string
	loginUrl: string
	geoLocation: string
	injectionType: string
	disableRequestReplay: boolean
	verificationType: string
	requestData: unknown[]
	useIncognitoWebview: boolean
	customInjection: string
	userAgent: { ios: string; android: string }
	metadata: Record<string, unknown>
	version: { major: number; minor: number; patch: number }
	[key: string]: unknown
}

export interface ProviderSummary {
	providerId: string
	name: string
	description: string
	logoUrl: string
}

const DATA_DIR = resolve('data/providers')

function ensureDataDir() {
	if(!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true })
	}
}

/**
 * Load all providers from JSON files in data/providers/
 */
export function getAllProviders(): ProviderConfig[] {
	ensureDataDir()
	const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
	const providers: ProviderConfig[] = []
	for(const file of files) {
		try {
			const content = readFileSync(join(DATA_DIR, file), 'utf-8')
			providers.push(JSON.parse(content))
		} catch(err) {
			logger.error({ err, file }, 'Failed to load provider file')
		}
	}

	return providers
}

/**
 * Get provider summaries (id, name, description, logoUrl)
 */
export function getProviderList(): ProviderSummary[] {
	return getAllProviders().map(p => ({
		providerId: p.providerId,
		name: p.name,
		description: p.description,
		logoUrl: p.logoUrl,
	}))
}

/**
 * Get a single provider by providerId
 */
export function getProviderById(providerId: string): ProviderConfig | undefined {
	ensureDataDir()
	// Try direct file lookup first (filename = providerId.json)
	const directPath = join(DATA_DIR, `${providerId}.json`)
	if(existsSync(directPath)) {
		try {
			const content = readFileSync(directPath, 'utf-8')
			return JSON.parse(content)
		} catch(err) {
			logger.error({ err, providerId }, 'Failed to load provider file')
		}
	}

	// Fallback: scan all files, match by providerId or httpProviderId
	const all = getAllProviders()
	return all.find(p => p.providerId === providerId || p.httpProviderId === providerId)
}

/**
 * Save or update a provider
 */
export function saveProvider(provider: ProviderConfig): void {
	ensureDataDir()
	const filePath = join(DATA_DIR, `${provider.providerId}.json`)
	writeFileSync(filePath, JSON.stringify(provider, null, 2), 'utf-8')
	logger.info({ providerId: provider.providerId }, 'Provider saved')
}

/**
 * Delete a provider by providerId
 */
export function deleteProvider(providerId: string): boolean {
	const filePath = join(DATA_DIR, `${providerId}.json`)
	if(existsSync(filePath)) {
		unlinkSync(filePath)
		logger.info({ providerId }, 'Provider deleted')
		return true
	}

	return false
}
