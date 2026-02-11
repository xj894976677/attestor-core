import { claimTeeBundle } from '#src/server/handlers/claimTeeBundle.js'
import { claimTunnel } from '#src/server/handlers/claimTunnel.js'
import { completeClaimOnChain } from '#src/server/handlers/completeClaimOnChain.js'
import { createClaimOnChain } from '#src/server/handlers/createClaimOnChain.js'
import { createTaskOnMechain } from '#src/server/handlers/createTaskOnMechain.js'
import { createTunnel } from '#src/server/handlers/createTunnel.js'
import { disconnectTunnel } from '#src/server/handlers/disconnectTunnel.js'
import { fetchCertificateBytes } from '#src/server/handlers/fetchCertificateBytes.js'
import { init } from '#src/server/handlers/init.js'
import { toprf } from '#src/server/handlers/toprf.js'
import type { RPCHandler, RPCType } from '#src/types/index.js'

export const HANDLERS: { [T in RPCType]: RPCHandler<T> } = {
	createTunnel,
	disconnectTunnel,
	claimTunnel,
	claimTeeBundle,
	init,
	createClaimOnChain,
	completeClaimOnChain,
	toprf,
	createTaskOnMechain,
	fetchCertificateBytes
}