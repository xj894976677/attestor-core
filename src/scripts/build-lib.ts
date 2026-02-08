/**
 * Build lib/index.js using esbuild for external consumers (e.g. browser-extension-sdk).
 *
 * attestor-core v5 uses `node --experimental-strip-types` at runtime
 * and doesn't need compiled JS. But external packages that depend on
 * attestor-core via `file:` reference need `lib/index.js` to exist
 * (as declared in package.json exports).
 */
import { build } from 'esbuild'

await build({
	entryPoints: ['src/index.ts'],
	outfile: 'lib/index.js',
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	sourcemap: true,
	// Don't bundle these — they're provided by the consumer's node_modules
	external: [
		'@reclaimprotocol/tls',
		'@reclaimprotocol/zk-symmetric-crypto',
		'@bufbuild/protobuf',
		'@peculiar/*',
		'ethers',
		'snarkjs',
		'pino',
		'ws',
		'dotenv',
		'koffi',
		're2',
		'ajv',
		'canonicalize',
		'cbor-x',
		'cose-js',
		'esprima-next',
		'https-proxy-agent',
		'ip-cidr',
		'jsonpath-plus',
		'p-queue',
		'parse5',
		'parse5-htmlparser2-tree-adapter',
		'serve-static',
		'xpath',
		'node:*',
		'fs',
		'path',
		'http',
		'crypto',
		'net',
		'tls',
		'stream',
		'url',
		'child_process',
		'worker_threads',
	],
})

console.log('lib/index.js built successfully')
