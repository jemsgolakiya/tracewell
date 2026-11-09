// Jira data access. Every read goes through a "client" so the same code runs as the
// signed-in user (UI, Rovo, MCP) or as the app (scheduled snapshots).
import api, { route } from '@forge/api';

const FIELDS = [
  'summary', 'status', 'issuetype', 'labels', 'priority', 'assignee', 'updated', 'created',
  'resolutiondate', 'statuscategorychangedate', 'fixVersions', 'issuelinks',
];
const MAX_ISSUES = 1000;

export const asUser = () => api.asUser();
export const asApp = () => api.asApp();

async function json(res, what) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${what} failed (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return {};
  return res.json();
}

export function normalizeIssue(raw) {
  const f = raw.fields || {};
  const statusCategory = f.status?.statusCategory?.key || 'new';
  const links = (f.issuelinks || [])
    .map((l) => ({ key: (l.outwardIssue || l.inwardIssue)?.key, type: l.type?.name }))
    .filter((l) => l.key);
  return {
    key: raw.key,
    id: raw.id,
    summary: f.summary || '',
    type: f.issuetype?.name || '',
    status: f.status?.name || '',
    statusCategory,
    labels: f.labels || [],
    priority: f.priority?.name || null,
    assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName } : null,
    created: f.created,
    updated: f.updated,
    // team-managed projects often have no resolution; fall back to the status-category change date
    resolved: statusCategory === 'done' ? f.resolutiondate || f.statuscategorychangedate || f.updated : null,
    fixVersions: (f.fixVersions || []).map((v) => v.name),
    links,
    lastContentChange: f.created,
  };
}

export async function searchProjectIssues(client, projectKey) {
  const issues = [];
  let nextPageToken;
  do {
    const res = await client.requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = "${projectKey.replace(/"/g, '')}" ORDER BY key ASC`,
        fields: FIELDS,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    const body = await json(res, 'Issue search');
    for (const raw of body.issues || []) issues.push(normalizeIssue(raw));
    nextPageToken = body.isLast === false || body.nextPageToken ? body.nextPageToken : undefined;
  } while (nextPageToken && issues.length < MAX_ISSUES);
  return issues;
}

/**
 * When did the *content* (summary/description) of each issue last change?
 * Uses the bulk changelog API so a status change or a new link does not
 * create a false "suspect" verification.
 */
export async function attachContentChanges(client, issues) {
  const ids = issues.map((i) => i.id);
  if (!ids.length) return { ok: true };
  const latest = new Map();
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      let nextPageToken;
      do {
        const res = await client.requestJira(route`/rest/api/3/changelog/bulkfetch`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueIdsOrKeys: ids.slice(i, i + 1000),
            fieldIds: ['summary', 'description'],
            maxResults: 1000,
            ...(nextPageToken ? { nextPageToken } : {}),
          }),
        });
        const body = await json(res, 'Changelog fetch');
        for (const log of body.issueChangeLogs || []) {
          for (const h of log.changeHistories || []) {
            const t = typeof h.created === 'number' ? new Date(h.created).toISOString() : h.created;
            const prev = latest.get(String(log.issueId));
            if (!prev || new Date(t) > new Date(prev)) latest.set(String(log.issueId), t);
          }
        }
        nextPageToken = body.nextPageToken;
      } while (nextPageToken);
    }
  } catch (e) {
    console.warn('Bulk changelog unavailable, suspect-link detection disabled:', e.message);
    return { ok: false };
  }
  for (const issue of issues) {
    const t = latest.get(String(issue.id));
    if (t) issue.lastContentChange = t;
  }
  return { ok: true };
}

export async function loadProjectIssues(client, projectKey, { roleFilter } = {}) {
  const issues = await searchProjectIssues(client, projectKey);
  const candidates = roleFilter ? issues.filter(roleFilter) : issues;
  const changelog = await attachContentChanges(client, candidates);
  return { issues, changelogOk: changelog.ok };
}

export async function getProject(client, projectKey) {
  const res = await client.requestJira(route`/rest/api/3/project/${projectKey}`, { headers: { Accept: 'application/json' } });
  return json(res, 'Project lookup');
}

export async function getVersions(client, projectKey) {
  const res = await client.requestJira(route`/rest/api/3/project/${projectKey}/versions`, { headers: { Accept: 'application/json' } });
  const body = await json(res, 'Versions lookup');
  return (body || []).filter((v) => !v.archived).map((v) => ({ id: v.id, name: v.name, released: !!v.released, releaseDate: v.releaseDate || null }));
}

export async function getIssue(client, issueKey) {
  const res = await client.requestJira(route`/rest/api/3/issue/${issueKey}?fields=project,summary`, { headers: { Accept: 'application/json' } });
  const body = await json(res, 'Issue lookup');
  return { key: body.key, id: body.id, projectKey: body.fields?.project?.key, summary: body.fields?.summary };
}

/** App-side authorization check used only when an external MCP client cannot act as the user. */
export async function userCanBrowse(accountId, projectId) {
  if (!accountId || !projectId) return false;
  const res = await api.asApp().requestJira(route`/rest/api/3/permissions/check`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, projectPermissions: [{ permissions: ['BROWSE_PROJECTS'], projects: [Number(projectId)] }] }),
  });
  if (!res.ok) return false;
  const body = await res.json();
  return (body.projectPermissions || []).some((p) => p.permission === 'BROWSE_PROJECTS' && (p.projects || []).map(String).includes(String(projectId)));
}

export { json as readJson };
