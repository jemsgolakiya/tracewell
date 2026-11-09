// Teamwork Graph: pull external engineering evidence (pull requests, deployments)
// linked to the implementation items of a requirement. This extends the trace
// chain beyond Jira: requirement -> story -> PR -> deployment.
//
// Notes from the Preview API:
//  * requestTeamworkGraph exists only on asUser(); results are permission-filtered.
//  * HTTP 200 can still carry errors, so we check `errors` explicitly.
//  * Operation names must look like `<company>_<operation>`.
//  * Missing scopes silently drop rows, so "no evidence" is reported as "none found", never as a failure.
import api from '@forge/api';

const RICH = {
  // Field names verified against the Teamwork Graph object-type reference.
  pr: '... on ExternalPullRequest { id displayId title displayName url status provider { name } }',
  deployment: '... on ExternalDeployment { id displayName url state environment { type } }',
};

const query = (field, op, fragment) => `query tracewell_${op}($id: ID!) {
  ${field}(id: $id, first: 25) {
    edges { node { __typename id ${fragment} } }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function run(field, op, fragment, variables) {
  const text = query(field, op, fragment);
  const res = await api.asUser().requestTeamworkGraph(text, variables, `tracewell_${op}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.errors?.length || !body.data) {
    const msg = body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (body.data[field]?.edges || []).map((e) => e.node).filter(Boolean);
}

async function fetchKind(field, op, richFragment, variables) {
  try {
    return { items: await run(field, op, richFragment, variables), ok: true };
  } catch (richErr) {
    // Field names on external object types can differ by provider; retry with the minimal shape.
    try {
      return { items: await run(field, `${op}Basic`, '', variables), ok: true, note: richErr.message };
    } catch (e) {
      return { items: [], ok: false, note: e.message };
    }
  }
}

const shape = (n, kind) => ({
  kind,
  id: n.id,
  title: n.title || n.displayName || (kind === 'pr' ? `Pull request ${n.displayId || ''}`.trim() : 'Deployment'),
  url: n.url || null,
  state: n.status || n.state || null,
  environment: n.environment?.type || null,
  provider: n.provider?.name || null,
});

/**
 * @param {string} cloudId
 * @param {{key:string,id:string}[]} items Jira issues (implementation items) to inspect
 */
export async function evidenceFor(cloudId, items) {
  const out = [];
  const notes = [];
  let available = false;
  for (const item of items.slice(0, 8)) {
    const variables = { id: `ari:cloud:jira:${cloudId}:issue/${item.id}` };
    const [prs, deps] = await Promise.all([
      fetchKind('jiraWorkItemLinkedExternalPullRequests', 'workItemPullRequests', RICH.pr, variables),
      fetchKind('jiraWorkItemLinkedExternalDeployments', 'workItemDeployments', RICH.deployment, variables),
    ]);
    available = available || prs.ok || deps.ok;
    if (prs.note) notes.push(prs.note);
    if (deps.note) notes.push(deps.note);
    out.push({
      key: item.key,
      pullRequests: prs.items.map((n) => shape(n, 'pr')),
      deployments: deps.items.map((n) => shape(n, 'deployment')),
    });
  }
  return { available, items: out, notes: [...new Set(notes)].slice(0, 3) };
}
