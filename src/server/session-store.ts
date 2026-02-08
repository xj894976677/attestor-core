import { randomUUID } from 'crypto'

export interface Session {
	sessionId: string
	appId: string
	providerId: string
	timestamp: string
	signature: string
	status: string
	proofs?: unknown[]
	createdAt: number
}

const sessions = new Map<string, Session>()

export function createSession(
	appId: string,
	providerId: string,
	timestamp: string,
	signature: string
): Session {
	const sessionId = randomUUID()
	const session: Session = {
		sessionId,
		appId,
		providerId,
		timestamp,
		signature,
		status: 'SESSION_INIT',
		createdAt: Date.now(),
	}

	sessions.set(sessionId, session)
	return session
}

export function getSession(sessionId: string): Session | undefined {
	return sessions.get(sessionId)
}

export function updateSessionStatus(sessionId: string, status: string): boolean {
	const session = sessions.get(sessionId)
	if(!session) {
		return false
	}

	session.status = status
	return true
}

export function submitProof(sessionId: string, proofs: unknown[]): boolean {
	const session = sessions.get(sessionId)
	if(!session) {
		return false
	}

	session.proofs = proofs
	session.status = 'PROOF_SUBMITTED'
	return true
}
