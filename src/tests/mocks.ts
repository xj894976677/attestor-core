import { setCryptoImplementation } from '@joclaim/tls'
import { webcryptoCrypto } from '@joclaim/tls/webcrypto'
import { mock } from 'node:test'
import '#src/server/utils/config-env.js'

import { preparePacketsForReveal } from '#src/utils/prepare-packets.js'

setCryptoImplementation(webcryptoCrypto)

/**
 * Spies on the preparePacketsForReveal function
 */
export const SPY_PREPARER = mock.fn(preparePacketsForReveal)

mock.module('#src/utils/prepare-packets.js', {
	namedExports: {
		preparePacketsForReveal: SPY_PREPARER
	}
})

mock.module('#src/server/utils/apm.js', {
	namedExports: {
		getApm: mock.fn()
	}
})