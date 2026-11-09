import Resolver from '@forge/resolver';
import { route } from '@forge/api';
import { asUser, asApp } from './lib/jira.js';
import { overview, trace, readinessReport } from './lib/service.js';
import { saveConfig, getConfig, getTrackedProjects } from './lib/storage.js';
import { runSeedStep, removeDemo, SEED_STEPS } from './lib/seed.js';
import { getSeedState } from './lib/storage.js';
import { listSpaces, dossierStorage, createDossierPage } from './lib/confluence.js';
import { FRAMEWORKS } from './lib/frameworks.js';

export { getReadiness, listGaps, traceRequirement, analyzeImpact } from './agent.js';
import { withClient } from './agent.js';

const resolver = new Resolver();
const KEY_RE = /^[A-Z][A-Z0-9_]{0,19}$/;

/** Project key: trust the product context first, then validated input (Confluence macro config). */
function projectKeyOf(req) {
  const fromContext = req.context?.extension?.project?.key;
  const key = String(fromContext || req.payload?.projectKey || '').toUpperCase();
  if (!KEY_RE.test(key)) throw new Error('A valid Jira project key is required.');
  return key;
}

const wrap = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || 'Unexpected error' };
  }
};

resolver.define('getOverview', wrap(async (req) => {
  const projectKey = projectKeyOf(req);
  const fixVersion = req.payload?.fixVersion || undefined;
  const [data, seed] = await Promise.all([overview(asUser(), projectKey, { fixVersion }), getSeedState(projectKey)]);
  return { ...data, frameworks: Object.values(FRAMEWORKS).map((f) => ({ id: f.id, name: f.name, industry: f.industry })), hasDemo: !!seed?.refs };
}));

resolver.define('getTrace', wrap(async (req) => {
  const issueKey = String(req.context?.extension?.issue?.key || '').toUpperCase();
  if (!issueKey) throw new Error('No issue in context.');
  return trace(asUser(), issueKey, { cloudId: req.context?.cloudId, withEvidence: true });
}));

resolver.define('saveConfig', wrap(async (req) => saveConfig(projectKeyOf(req), req.payload?.config)));

resolver.define('seedStep', wrap(async (req) => {
  const projectKey = projectKeyOf(req);
  const step = req.payload?.step;
  if (!SEED_STEPS.includes(step)) throw new Error('Unknown step');
  const config = await getConfig(projectKey);
  return runSeedStep(projectKey, step, config.labels);
}));

resolver.define('removeDemo', wrap(async (req) => removeDemo(projectKeyOf(req))));

resolver.define('listSpaces', wrap(async () => listSpaces()));

resolver.define('exportDossier', wrap(async (req) => {
  const projectKey = projectKeyOf(req);
  const spaceId = String(req.payload?.spaceId || '');
  if (!/^\d+$/.test(spaceId)) throw new Error('Choose a Confluence space.');
  const fixVersion = req.payload?.fixVersion || undefined;
  const { report } = await readinessReport(asUser(), projectKey, { fixVersion });
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const projectName = String(req.payload?.projectName || projectKey).slice(0, 120);
  const title = `Audit dossier: ${projectKey}${fixVersion ? ` ${fixVersion}` : ''} (${generatedAt})`;
  const me = await asUser().requestJira(route`/rest/api/3/myself`, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const body = dossierStorage({ report, projectKey, projectName, fixVersion, preparedBy: me.displayName, generatedAt });
  return createDossierPage({ spaceId, title, body });
}));

// Confluence macro: live readiness badge for a Jira project.
resolver.define('getMacroReadiness', wrap(async (req) => {
  const projectKey = String(req.context?.extension?.config?.projectKey || req.payload?.projectKey || '').toUpperCase();
  if (!KEY_RE.test(projectKey)) return { needsConfig: true };
  const fixVersion = String(req.context?.extension?.config?.fixVersion || req.payload?.fixVersion || '').trim().slice(0, 100) || undefined;
  // Cross-product call (Confluence -> Jira): as the viewer, or as the app after a BROWSE_PROJECTS check.
  const viewer = { principal: { accountId: req.context?.accountId } };
  const { report } = await withClient({}, viewer, projectKey, (c) => readinessReport(c, projectKey, { fixVersion }));
  return { projectKey, fixVersion: fixVersion || null, score: report.score, verdict: report.verdict, counts: report.counts, metrics: report.metrics, topGaps: report.gaps.slice(0, 5), framework: report.framework };
}));

export const handler = resolver.getDefinitions();

/** Daily scheduled snapshot so the readiness trend builds up even when nobody opens the page. */
export async function dailySnapshot() {
  const projects = await getTrackedProjects();
  for (const projectKey of projects) {
    try {
      await readinessReport(asApp(), projectKey, { snapshot: true });
    } catch (e) {
      console.warn(`Snapshot failed for ${projectKey}: ${e.message}`);
    }
  }
}
