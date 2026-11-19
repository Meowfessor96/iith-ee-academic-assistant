import { build } from 'esbuild'

await build({ entryPoints: ['client/identity.js'], outfile: 'public/identity.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022' })
