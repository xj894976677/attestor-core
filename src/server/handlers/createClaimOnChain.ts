import type { IReclaimServiceManager } from '#src/avs/contracts/ReclaimServiceManager.js'
import { getContracts } from '#src/avs/utils/contracts.js'
import { createNewClaimRequestOnChain } from '#src/avs/utils/tasks.js'
import type { RPCHandler } from '#src/types/index.js'
import { getEnvVariable } from '#src/utils/env.js'
import { AttestorError, ethersStructToPlainObject } from '#src/utils/index.js'

const ACCEPT_CLAIM_PAYMENT_REQUESTS = getEnvVariable('ACCEPT_CLAIM_PAYMENT_REQUESTS') === '1'

export const createClaimOnChain: RPCHandler<'createClaimOnChain'> = async(
	{ chainId: chainIdNum, jsonCreateClaimRequest, requestSignature },
) => {
	if(!ACCEPT_CLAIM_PAYMENT_REQUESTS) {
		throw new AttestorError(
			'ERROR_PAYMENT_REFUSED',
			'Payment requests are not accepted at this time'
		)
	}

	const chainId = chainIdNum.toString()
	const { wallet } = getContracts(chainId.toString())
	const request: IReclaimServiceManager.ClaimRequestStruct
		= JSON.parse(jsonCreateClaimRequest)
	const { task, tx } = await createNewClaimRequestOnChain({
		request,
		owner: request.owner,
		payer: wallet!,
		chainId,
		requestSignature: requestSignature
	})

	const plainTask = ethersStructToPlainObject(task)

	return {
		txHash: tx.transactionHash,
		taskIndex: task.taskIndex,
		jsonTask: JSON.stringify(plainTask)
	}
}