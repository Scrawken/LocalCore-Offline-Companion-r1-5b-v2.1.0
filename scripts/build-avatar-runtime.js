const path = require('path');
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: [path.join(__dirname, '../renderer/avatar-runtime-entry.js')],
  outfile: path.join(__dirname, '../renderer/avatar-runtime.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome125']
}).catch(error => {
  console.error('Could not build the local VRM avatar runtime:', error);
  process.exitCode = 1;
});
