// Rovo agent actions and MCP tools. The same handlers back both surfaces:
// the in-product "Tracewell Auditor" agent and the rovo:mcp server used by
// external AI clients (Claude, Cursor, VS Code ...).
import { asUser, asApp, getProject, userCanBrowse, getIssue } from './lib/jira.js';
import { readinessReport, trace, impact } from './lib/service.js';

const KEY_RE = /^[A-Z][A-Z0-9_]{0,19}$/;
const ISSUE_RE = /^[A-Z][A-Z0-9_]{0,19}-\d+$/;

function projectKeyFrom(payload) {
  const raw = payload?.projectKey || payload?.context?.jira?.projectKey || (payload?.issueKey || payload?.context?.jira?.issueKey || '').split('-')[0];
  const key = String(raw || '').trim().toUpperCase();
  return KEY_RE.test(key) ? key : null;
}

function issueKeyFrom(payload) {
  const key = String(payload?.issueKey || payload?.context?.jira?.issueKey || '').trim().toUpperCase();
  return ISSUE_RE.test(key) ? key : null;
}

const accountIdFrom = (payload, context) =>
  context?.principal?.accountId || payload?.context?.principal?.accountId || payload?.context?.accountId || null;

/**
 * Run as the invoking user. If the call comes from an external MCP client that cannot
 * act as the user, fall back to the app identity ONLY after verifying that this user
 * can browse the project (never return data the user could not see in Jira).
 */
export async function withClient(payload, context, projectKey, fn) {
  try {
    return await fn(asUser());
  } catch (e) {
    // 401/403 or a thrown error without status = no user consent/context (e.g. external MCP client).
    if (e.status && e.status < 500 && e.status !== 401 && e.status !== 403) throw e;
    const accountId = accountIdFrom(payload, context);
    const project = await getProject(asApp(), projectKey).catch(() => null);
    if (!project || !(await userCanBrowse(accountId, project.id))) {
      throw new Error('Tracewell could not verify your access to this project. Open the app once in Jira to grant consent.');
    }
    return fn(asApp());
  }
}

const fail = (message) => ({ ok: false, message });
const issueRef = (k) => k;

export async function getReadiness(payload, context) {
  const projectKey = projectKeyFrom(payload);
  if (!projectKey) return fail('Tell me which Jira project to check (for example "PUMP").');
  const fixVersion = payload?.fixVersion ? String(payload.fixVersion).slice(0, 100) : undefined;
  try {
    const { report, changelogOk } = await withClient(payload, context, projectKey, (c) => readinessReport(c, projectKey, { fixVersion }));
    return {
      ok: true,
      projectKey,
      scope: fixVersion ? `release ${fixVersion}` : 'all items',
      framework: report.framework.name,
      auditReadinessScore: report.score,
      verdict: report.verdict,
      openGaps: report.counts,
      metrics: report.metrics,
      requirementStatus: report.verdictCounts,
      topGaps: report.gaps.slice(0, 8).map((g) => ({ severity: g.severity, item: issueRef(g.key), finding: g.title, detail: g.detail, clause: g.clause, fix: g.fix })),
      suspectDetection: changelogOk ? 'on' : 'off (changelog unavailable)',
    };
  } catch (e) {
    return fail(e.message);
  }
}

export async function listGaps(payload, context) {
  const projectKey = projectKeyFrom(payload);
  if (!projectKey) return fail('Tell me which Jira project to check.');
  const severity = ['critical', 'major', 'minor'].includes(String(payload?.severity || '').toLowerCase()) ? String(payload.severity).toLowerCase() : null;
  const fixVersion = payload?.fixVersion ? String(payload.fixVersion).slice(0, 100) : undefined;
  try {
    const { report } = await withClient(payload, context, projectKey, (c) => readinessReport(c, projectKey, { fixVersion }));
    const gaps = report.gaps.filter((g) => !severity || g.severity === severity);
    return {
      ok: true,
      projectKey,
      filter: severity || 'all severities',
      total: gaps.length,
      gaps: gaps.slice(0, 40).map((g) => ({ severity: g.severity, item: g.key, summary: g.summary, finding: g.title, detail: g.detail, clause: g.clause, fix: g.fix, owner: g.assignee?.displayName || 'Unassigned' })),
    };
  } catch (e) {
    return fail(e.message);
  }
}

export async function traceRequirement(payload, context) {
  const issueKey = issueKeyFrom(payload);
  if (!issueKey) return fail('Which issue should I trace? Give me a key like PUMP-3.');
  try {
    const res = await withClient(payload, context, issueKey.split('-')[0], (c) => trace(c, issueKey, { cloudId: payload?.context?.cloudId, withEvidence: true }));
    if (res.notTraced) return { ok: true, issueKey, message: 'This issue is not part of the trace graph.' };
    const t = res.trace;
    return {
      ok: true,
      item: { key: t.key, summary: t.summary, role: t.role, safetyRelevant: t.safety, status: t.status, verdict: t.verdict },
      upstream: { requirements: t.links.requirements, hazards: t.links.hazards },
      downstream: { tests: t.links.tests, implementation: t.links.implementation },
      gaps: t.gaps.map((g) => ({ severity: g.severity, finding: g.title, detail: g.detail, clause: g.clause, fix: g.fix })),
      engineeringEvidence: res.evidence,
    };
  } catch (e) {
    return fail(e.message);
  }
}

export async function analyzeImpact(payload, context) {
  const issueKey = issueKeyFrom(payload);
  if (!issueKey) return fail('Which issue are you planning to change? Give me a key like PUMP-2.');
  try {
    const res = await withClient(payload, context, issueKey.split('-')[0], (c) => impact(c, issueKey));
    if (!res) return { ok: true, issueKey, message: 'This issue is not part of the trace graph.' };
    return { ok: true, ...res };
  } catch (e) {
    return fail(e.message);
  }
}

// Exported for tests
export const _internal = { projectKeyFrom, issueKeyFrom, getIssue };
