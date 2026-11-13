// In-memory fake of the Jira/Confluence/Teamwork Graph APIs used by Tracewell.
// Lets the integration test run seed -> overview -> trace -> dossier -> agent end-to-end offline.
export const state = { issues: new Map(), links: [], versions: [], pages: [], seq: 0, clock: Date.parse('2026-11-09T10:00:00Z'), calls: [] };

const now = () => new Date((state.clock += 1500)).toISOString();
const STATUSES = { new: { name: 'To Do', key: 'new' }, indeterminate: { name: 'In Progress', key: 'indeterminate' }, done: { name: 'Done', key: 'done' } };

export function reset() {
  state.issues.clear(); state.links = []; state.versions = []; state.pages = []; state.seq = 0; state.calls = [];
}

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body, text: async () => JSON.stringify(body) });
const bad = (status, msg = 'error') => ({ ok: false, status, json: async () => ({ errorMessages: [msg] }), text: async () => msg });

function toRaw(i) {
  return {
    id: i.id, key: i.key,
    fields: {
      summary: i.summary, labels: i.labels, issuetype: { name: i.type }, priority: i.priority ? { name: i.priority } : null,
      status: { name: STATUSES[i.cat].name, statusCategory: { key: i.cat } }, assignee: null,
      created: i.created, updated: i.updated, resolutiondate: i.cat === 'done' ? i.resolved : null, statuscategorychangedate: i.catChanged,
      fixVersions: i.fixVersions.map((name) => ({ name })),
      issuelinks: state.links.filter((l) => l.a === i.key || l.b === i.key).map((l) => (l.a === i.key ? { type: { name: 'Relates' }, outwardIssue: { key: l.b } } : { type: { name: 'Relates' }, inwardIssue: { key: l.a } })),
    },
  };
}

async function handleJira(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  state.calls.push(`${method} ${path}`);
  let m;
  if ((m = path.match(/^\/rest\/api\/3\/project\/([A-Z0-9_]+)$/))) {
    return ok({ id: '10001', key: m[1], name: 'PumpOS', issueTypes: [{ id: '1', name: 'Task', subtask: false }, { id: '2', name: 'Story', subtask: false }, { id: '3', name: 'Sub-task', subtask: true }] });
  }
  if ((m = path.match(/^\/rest\/api\/3\/project\/([A-Z0-9_]+)\/versions$/))) return ok(state.versions);
  if (path === '/rest/api/3/version' && method === 'POST') { const v = { id: String(state.versions.length + 1), name: body.name, released: false, archived: false }; state.versions.push(v); return ok(v, 201); }
  if (path === '/rest/api/3/issue' && method === 'POST') {
    if (mode.createScreenWithoutFixVersions && body.fields.fixVersions) return bad(400, 'Field fixVersions cannot be set');
    state.seq += 1;
    const f = body.fields;
    const t = now();
    const issue = { id: String(20000 + state.seq), key: `${f.project.key}-${state.seq}`, summary: f.summary, labels: f.labels || [], type: f.issuetype.id === '2' ? 'Story' : 'Task',
      priority: f.priority?.name || 'Medium', fixVersions: (f.fixVersions || []).map((v) => v.name), cat: 'new', created: t, updated: t, resolved: null, catChanged: t, history: [] };
    state.issues.set(issue.key, issue);
    return ok({ id: issue.id, key: issue.key }, 201);
  }
  if (path === '/rest/api/3/issueLink' && method === 'POST') { state.links.push({ a: body.outwardIssue.key, b: body.inwardIssue.key }); return ok({}, 201); }
  if ((m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)\/transitions$/))) {
    const issue = state.issues.get(m[1]);
    if (!issue) return bad(404);
    if (method === 'GET') return ok({ transitions: [{ id: '11', to: { statusCategory: { key: 'new' } } }, { id: '21', to: { statusCategory: { key: 'indeterminate' } } }, { id: '31', to: { statusCategory: { key: 'done' } } }] });
    const cat = { 11: 'new', 21: 'indeterminate', 31: 'done' }[body.transition.id];
    const t = now();
    issue.cat = cat; issue.updated = t; issue.catChanged = t; if (cat === 'done') issue.resolved = t;
    return ok({}, 204);
  }
  if ((m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)\/comment$/)) && method === 'POST') {
    const issue = state.issues.get(m[1]);
    if (!issue) return bad(404);
    (issue.comments = issue.comments || []).push(body.body);
    return ok({ id: String(issue.comments.length) }, 201);
  }
  if ((m = path.match(/^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)(\?.*)?$/))) {
    const issue = state.issues.get(m[1]);
    if (!issue) return bad(404, 'Issue does not exist');
    if (method === 'PUT' && body.fields.fixVersions) { issue.fixVersions = body.fields.fixVersions.map((v) => v.name); return ok({}, 204); }
    if (method === 'PUT' && body.fields.priority) { issue.priority = body.fields.priority.name; return ok({}, 204); }
    if (method === 'PUT') { const t = now(); issue.summary = body.fields.summary; issue.updated = t; issue.history.push({ created: t, items: [{ field: 'summary', fieldId: 'summary' }] }); return ok({}, 204); }
    if (method === 'DELETE' && mode.deleteForbidden) return bad(403, 'no delete permission');
    if (method === 'DELETE') { state.issues.delete(m[1]); state.links = state.links.filter((l) => l.a !== m[1] && l.b !== m[1]); return ok({}, 204); }
    return ok({ id: issue.id, key: issue.key, fields: { project: { key: issue.key.split('-')[0] }, summary: issue.summary } });
  }
  if (path === '/rest/api/3/search/jql' && method === 'POST') {
    const key = body.jql.match(/project = "([^"]+)"/)[1];
    const all = [...state.issues.values()].filter((i) => i.key.startsWith(`${key}-`)).sort((a, b) => Number(a.id) - Number(b.id));
    const start = Number(body.nextPageToken || 0);
    const page = all.slice(start, start + body.maxResults);
    const next = start + body.maxResults < all.length ? String(start + body.maxResults) : undefined;
    return ok({ issues: page.map(toRaw), isLast: !next, ...(next ? { nextPageToken: next } : {}) });
  }
  if (path === '/rest/api/3/changelog/bulkfetch' && method === 'POST') {
    const logs = body.issueIdsOrKeys.map((id) => [...state.issues.values()].find((i) => i.id === id)).filter(Boolean)
      .map((i) => ({ issueId: i.id, changeHistories: i.history }));
    return ok({ issueChangeLogs: logs });
  }
  if (path === '/rest/api/3/myself') return ok({ displayName: 'Jemish Golakiya' });
  if (path === '/rest/api/3/permissions/check' && method === 'POST') {
    return ok({ projectPermissions: [{ permission: 'BROWSE_PROJECTS', projects: body.accountId === 'allowed' ? [Number(body.projectPermissions[0].projects[0])] : [] }] });
  }
  return bad(404, `fake: no route for ${method} ${path}`);
}

async function handleConfluence(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  state.calls.push(`${method} ${path}`);
  if (path.startsWith('/wiki/api/v2/spaces')) return ok({ results: [{ id: '98765', key: 'QA', name: 'Quality & Regulatory' }] });
  if (path === '/wiki/api/v2/pages' && method === 'POST') {
    const body = JSON.parse(opts.body);
    state.pages.push(body);
    return ok({ id: '555', title: body.title, _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/QA/pages/555' } });
  }
  return bad(404);
}

async function handleGraph(query) {
  state.calls.push(`TWG ${query.match(/query (\w+)/)[1]}`);
  if (query.includes('jiraWorkItemLinkedExternalPullRequests')) {
    return ok({ data: { jiraWorkItemLinkedExternalPullRequests: { edges: [{ node: { __typename: 'ExternalPullRequest', id: 'pr-1', displayName: 'PUMP-21 occlusion cut-off', url: 'https://bitbucket.org/x/pr/1', status: 'MERGED' } }], pageInfo: { hasNextPage: false } } } });
  }
  return ok({ data: null, errors: [{ message: 'Field environmentType not found' }] });
}

const client = {
  requestJira: (path, opts) => handleJira(String(path), opts),
  requestConfluence: (path, opts) => handleConfluence(String(path), opts),
  requestTeamworkGraph: (q) => handleGraph(q),
};
export const mode = { asUserThrows: false, confluenceUser401: false, createScreenWithoutFixVersions: false, deleteForbidden: false };
const api = {
  asUser: () => {
    if (mode.asUserThrows) return { ...client, requestJira: async () => { throw new Error('No user context'); } };
    if (mode.confluenceUser401) return { ...client, requestConfluence: async () => bad(401, 'consent required') };
    return client;
  },
  asApp: () => client,
};
export default api;
export const route = (strings, ...values) => strings.reduce((acc, s, i) => acc + s + (i < values.length ? encodeURIComponent(values[i]).replace(/%2F/g, '/').replace(/%3F/g, '?').replace(/%3D/g, '=').replace(/%26/g, '&') : ''), '');
