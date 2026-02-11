import type { createClaimOnAttestor } from '#src/client/index.js'
import type { CreateClaimOnAttestorOpts, ProviderName } from '#src/types/index.js'

export type CreateClaimOnMechainStep =
{
    type: 'taskRequested'
    timestamp: number
} | {
    type: 'taskCreated'
    taskId: number
} | {
    type: 'attestorRequested'
    host: string
}

export type DefaultClient = {
    url: string
}

export type CreateClaimOnMechainOpts<N extends ProviderName> = (
    Omit<CreateClaimOnAttestorOpts<N>, 'onStep' | 'client'>
) & {
    onStep?(step: CreateClaimOnMechainStep): void
    /**
     * Override the default createClaimOnAttestor function
     */
    createClaimOnAttestor?: typeof createClaimOnAttestor
    client: DefaultClient
}