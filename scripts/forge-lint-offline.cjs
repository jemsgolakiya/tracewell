// Runs the client-side linters of `forge lint` (handlers, permissions/scopes used in code,
// manifest, Teamwork Graph, timeouts) without needing a Forge login.
const path = require('path');
const fs = require('fs');
const cliRoot = process.env.FORGE_CLI_ROOT || path.join(require('child_process').execSync('npm root -g').toString().trim(), '@forge/cli');
const req = (m) => require(path.join(cliRoot, 'node_modules', m));
const { lint, reportLintResults, problemCount, getClientSideLintersOnly } = req('@forge/lint');
const { parse: load } = require(path.join(cliRoot, 'node_modules/yaml'));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
(async () => {
  const manifest = load(fs.readFileSync('manifest.yml', 'utf8'));
  const files = walk('src').filter((f) => /\.(jsx?|tsx?)$/.test(f));
  const logger = { info: console.log, warn: console.log, error: console.log, debug: () => {}, trace: () => {}, success: console.log, table: console.table };
  const statsig = { getDeprecatedRuntimes: async () => [] };
  const all = await getClientSideLintersOnly(manifest, 'development', logger, statsig);
  const linters = [];
  for (const l of all) {
    try { await l.bootstrap(); linters.push(Object.assign(l, { bootstrap: async () => {} })); }
    catch (e) { console.log(`(skipped ${l.constructor.name}: needs network - ${e.message})`); }
  }
  const results = await lint(files, manifest, 'development', logger, statsig, { linter: { mode: 'client-side' }, linters });
  reportLintResults(logger, results, true);
  const c = problemCount(results);
  console.log(`\nerrors=${c.errors} warnings=${c.warnings}`);
  process.exitCode = c.errors ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
