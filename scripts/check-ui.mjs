// Local verification without a Forge site:
// 1. bundles every UI Kit resource and the backend with esbuild (catches bad imports/JSX)
// 2. type-checks UI Kit props against @atlaskit/forge-react-types
import { build } from 'esbuild';
import { execSync } from 'node:child_process';

const common = { bundle: true, write: false, logLevel: 'error', jsx: 'automatic', loader: { '.js': 'jsx' } };
const targets = [
  { entryPoints: ['src/frontend/projectPage.jsx'], platform: 'browser' },
  { entryPoints: ['src/frontend/issuePanel.jsx'], platform: 'browser' },
  { entryPoints: ['src/frontend/macro.jsx'], platform: 'browser' },
  { entryPoints: ['src/index.js'], platform: 'node', format: 'cjs' },
];
for (const t of targets) {
  const res = await build({ ...common, ...t });
  console.log(`bundled ${t.entryPoints[0]} (${Math.round(res.outputFiles[0].contents.length / 1024)} KB)`);
}
execSync('npx tsc -p tsconfig.check.json', { stdio: 'inherit' });
console.log('UI Kit prop types OK');
