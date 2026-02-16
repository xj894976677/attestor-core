import * as esbuild from 'esbuild'

const rslt = await esbuild.build({
	entryPoints: ['src/external-rpc/setup-browser.ts'],
	bundle: true,
	minify: true,
	outfile: 'browser/resources/attestor-browser.min.mjs',
	platform: 'browser',
	format: 'esm',
	tsconfig: 'tsconfig.build.json',
	legalComments: 'none',
	metafile: true, // Enable metafile generation
	treeShaking: true,
	alias: {
		'crypto': '#src/scripts/fallbacks/crypto.js',
		'koffi': '#src/scripts/fallbacks/empty.js',
		'ip-cidr': '#src/scripts/fallbacks/empty.js',
		'snarkjs': '#src/scripts/fallbacks/snarkjs.js',
		're2': '#src/scripts/fallbacks/re2.js',
	},
	external: [
		'dotenv',
		'elastic-apm-node',
		'https-proxy-agent',
		'ip-cidr',
		'serve-static',
		're2',
		'snarkjs',
		'ws',

		'fs/promises',
		'path',
	],
})

if(process.argv.includes('--analyze')) {
	// Analyze the metafile
	const analysis = await esbuild.analyzeMetafile(rslt.metafile)
	console.log(analysis)
}