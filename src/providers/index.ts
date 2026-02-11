import http from '#src/providers/http/index.js'
import type { Provider, ProviderName } from '#src/types/index.js'

export const providers: {
	[T in ProviderName]: Provider<T>
} = {
	http,
}