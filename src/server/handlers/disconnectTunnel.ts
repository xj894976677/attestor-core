import type { RPCHandler } from '#src/types/index.js'

export const disconnectTunnel: RPCHandler<'disconnectTunnel'> = async(
	{ id },
	{ client }
) => {
	const tunnel = client.getTunnel(id)
	await tunnel.close()

	return {}
}