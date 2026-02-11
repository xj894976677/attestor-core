import { setCryptoImplementation } from '@joclaim/tls'
import { webcryptoCrypto } from '@joclaim/tls/webcrypto'
import '#src/server/utils/config-env.js'

import { getApm } from '#src/server/utils/apm.js'
getApm()

setCryptoImplementation(webcryptoCrypto)

async function main() {
	// importing dynamically to allow APM to inject
	// into modules before they are used
	const { createServer } = await import('#src/server/index.js')
	return createServer()
}

main()