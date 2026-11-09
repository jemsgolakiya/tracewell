// Offline manifest validation using the Forge CLI's own validator (same rules as `forge lint`'s manifest pass).
const path = require('path');
const cliRoot = process.env.FORGE_CLI_ROOT || path.join(require('child_process').execSync('npm root -g').toString().trim(), '@forge/cli');
const { validate } = require(path.join(cliRoot, 'node_modules/@forge/manifest'));
(async () => {
  const res = await validate(false, path.resolve('manifest.yml'));
  const errors = res.errors || [];
  if (!errors.length) { console.log('Manifest valid ✔'); return; }
  for (const e of errors) console.log(`- [${e.level || 'error'}] ${e.message}${e.reference ? ` (${e.reference})` : ''}${e.line ? ` line ${e.line}` : ''}`);
  process.exitCode = errors.some((e) => (e.level || 'error') === 'error') ? 1 : 0;
})();
