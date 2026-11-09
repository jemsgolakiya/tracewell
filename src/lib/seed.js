// One-click demo data so judges (and trial users) see value in under 30 seconds.
// Runs as the signed-in user in small steps, each well inside the resolver time limit.
import api, { route } from '@forge/api';
import { DEMO_ITEMS, demoLabels } from './demoData.js';
import { readJson, getProject } from './jira.js';
import { getSeedState, setSeedState } from './storage.js';

const user = () => api.asUser();
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

async function inChunks(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  }
  return out;
}

async function ensureVersions(project) {
  const wanted = [...new Set(DEMO_ITEMS.map((i) => i.fixVersion).filter(Boolean))];
  const res = await user().requestJira(route`/rest/api/3/project/${project.key}/versions`, { headers: H });
  const existing = res.ok ? (await res.json()).map((v) => v.name) : [];
  const available = new Set(existing);
  for (const name of wanted.filter((n) => !available.has(n))) {
    const r = await user().requestJira(route`/rest/api/3/version`, {
      method: 'POST', headers: H, body: JSON.stringify({ name, projectId: Number(project.id) }),
    });
    if (r.ok) available.add(name);
  }
  return available;
}

function pickTypes(project) {
  const types = (project.issueTypes || []).filter((t) => !t.subtask);
  const byName = (re) => types.find((t) => re.test(t.name));
  const task = byName(/^task$/i) || types[0];
  const story = byName(/^story$/i) || task;
  return { task, story };
}

async function createIssue(fields) {
  let res = await user().requestJira(route`/rest/api/3/issue`, { method: 'POST', headers: H, body: JSON.stringify({ fields }) });
  if (res.status !== 400) return readJson(res, 'Create issue');
  // Some create screens do not include priority or fix versions: create with the essentials,
  // then try to set each optional field through the edit screen (best effort).
  const { priority, fixVersions, ...essentials } = fields;
  res = await user().requestJira(route`/rest/api/3/issue`, { method: 'POST', headers: H, body: JSON.stringify({ fields: essentials }) });
  const created = await readJson(res, 'Create issue');
  for (const extra of [priority && { priority }, fixVersions && { fixVersions }].filter(Boolean)) {
    const r = await user().requestJira(route`/rest/api/3/issue/${created.key}`, { method: 'PUT', headers: H, body: JSON.stringify({ fields: extra }) });
    if (!r.ok) console.warn(`Could not set ${Object.keys(extra)[0]} on ${created.key}: ${r.status}`);
  }
  return created;
}

async function stepCreate(projectKey, labels) {
  const prior = await getSeedState(projectKey);
  if (prior?.refs) return { done: true, message: 'Demo items already exist', created: Object.keys(prior.refs).length };
  const project = await getProject(user(), projectKey);
  const { task, story } = pickTypes(project);
  if (!task) throw new Error('This project has no usable issue type.');
  const versions = await ensureVersions(project);
  const refs = {};
  // Sequential on purpose: keys come out in spec order (PUMP-1 = R1 ... PUMP-26 = S6), so the
  // demo script, tests and screenshots always reference the same issue keys.
  await inChunks(DEMO_ITEMS, 1, async (item) => {
    const fields = {
      project: { key: projectKey },
      summary: item.summary,
      issuetype: { id: (item.role === 'implementation' ? story : task).id },
      labels: demoLabels(item, labels),
    };
    if (item.priority) fields.priority = { name: item.priority };
    if (item.fixVersion && versions.has(item.fixVersion)) fields.fixVersions = [{ name: item.fixVersion }];
    const created = await createIssue(fields);
    refs[item.ref] = { key: created.key, id: created.id };
  });
  await setSeedState(projectKey, { refs, createdAt: new Date().toISOString() });
  return { done: true, created: Object.keys(refs).length };
}

async function stepLink(projectKey) {
  const { refs } = await getSeedState(projectKey);
  const pairs = DEMO_ITEMS.flatMap((item) => (item.links || []).map((to) => [item.ref, to]));
  let linked = 0;
  await inChunks(pairs, 6, async ([from, to]) => {
    const res = await user().requestJira(route`/rest/api/3/issueLink`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: { name: 'Relates' }, outwardIssue: { key: refs[from].key }, inwardIssue: { key: refs[to].key } }),
    });
    if (res.ok) linked += 1;
    else console.warn('Link failed', from, to, res.status);
  });
  return { done: true, linked };
}

async function transitionTo(key, category) {
  for (let hop = 0; hop < 3; hop += 1) {
    const res = await user().requestJira(route`/rest/api/3/issue/${key}/transitions`, { headers: H });
    const { transitions = [] } = await readJson(res, 'Get transitions');
    const direct = transitions.find((t) => t.to?.statusCategory?.key === category);
    const next = direct || (category === 'done' ? transitions.find((t) => t.to?.statusCategory?.key === 'indeterminate') : null);
    if (!next) return false;
    const r = await user().requestJira(route`/rest/api/3/issue/${key}/transitions`, {
      method: 'POST', headers: H, body: JSON.stringify({ transition: { id: next.id } }),
    });
    if (!r.ok) return false;
    if (direct) return true;
  }
  return false;
}

async function stepTransition(projectKey, phase) {
  const { refs } = await getSeedState(projectKey);
  // Requirements, hazards and stories first; tests last, so verification is the latest event.
  const items = DEMO_ITEMS.filter((i) => i.state !== 'todo' && (phase === 'tests' ? i.role === 'test' : i.role !== 'test'));
  let moved = 0;
  await inChunks(items, 5, async (item) => {
    const ok = await transitionTo(refs[item.ref].key, item.state === 'done' ? 'done' : 'indeterminate');
    if (ok) moved += 1;
  });
  return { done: true, moved };
}

async function stepEdit(projectKey) {
  const { refs } = await getSeedState(projectKey);
  let edited = 0;
  for (const item of DEMO_ITEMS.filter((i) => i.editAfterVerify)) {
    const res = await user().requestJira(route`/rest/api/3/issue/${refs[item.ref].key}`, {
      method: 'PUT', headers: H, body: JSON.stringify({ fields: { summary: item.editedSummary } }),
    });
    if (res.ok) edited += 1;
  }
  return { done: true, edited };
}

export const SEED_STEPS = ['create', 'link', 'transition', 'transition-tests', 'edit'];

export async function runSeedStep(projectKey, step, labels) {
  switch (step) {
    case 'create': return stepCreate(projectKey, labels);
    case 'link': return stepLink(projectKey);
    case 'transition': return stepTransition(projectKey, 'work');
    case 'transition-tests': return stepTransition(projectKey, 'tests');
    case 'edit': return stepEdit(projectKey);
    default: throw new Error(`Unknown seed step ${step}`);
  }
}

export async function removeDemo(projectKey) {
  const state = await getSeedState(projectKey);
  if (!state?.refs) return { removed: 0, remaining: 0 };
  const remaining = {};
  let removed = 0;
  let forbidden = false;
  await inChunks(Object.entries(state.refs), 6, async ([ref, item]) => {
    const res = await user().requestJira(route`/rest/api/3/issue/${item.key}`, { method: 'DELETE', headers: H });
    if (res.ok || res.status === 404) removed += 1;
    else {
      remaining[ref] = item;
      if (res.status === 403) forbidden = true;
    }
  });
  // Only forget the demo once every issue is gone, so a retry (or an admin) can finish the job.
  await setSeedState(projectKey, Object.keys(remaining).length ? { ...state, refs: remaining } : null);
  if (forbidden && !removed) {
    throw new Error('You need the "Delete issues" project permission to remove the demo issues. Ask a Jira admin, or use a fresh project for the demo.');
  }
  return { removed, remaining: Object.keys(remaining).length };
}
