// One-click fixes: turn a compliance gap into the Jira work that closes it.
// Always runs as the signed-in user, so Jira's own permissions decide what is allowed,
// and every created item is linked into the trace graph so the score updates on refresh.
import { route } from '@forge/api';
import { readJson, getProject } from './jira.js';
import { loadGraph } from './service.js';
import { evaluate } from './engine.js';
import { getFramework } from './frameworks.js';
import { getSeedState, setSeedState } from './storage.js';

const H = { Accept: 'application/json', 'Content-Type': 'application/json' };
const DEMO_LABEL = 'tracewell-demo';
const GAP_RE = /^[A-Z_]{3,40}:[A-Z][A-Z0-9_]{0,19}-\d+$/;

const adf = (...paragraphs) => ({
  type: 'doc',
  version: 1,
  content: paragraphs.filter(Boolean).map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function pickType(project, wanted) {
  const types = (project.issueTypes || []).filter((t) => !t.subtask);
  const byName = (re) => types.find((t) => re.test(t.name));
  const task = byName(/^task$/i) || types[0];
  if (wanted === 'story') return byName(/^story$/i) || task;
  if (wanted === 'bug') return byName(/^bug$/i) || task;
  return task;
}

async function createLinked(client, { project, type, summary, labels, description, linkTo }) {
  const res = await client.requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fields: { project: { key: project.key }, issuetype: { id: type.id }, summary: clip(summary, 240), labels, description } }),
  });
  let created;
  if (res.status === 400) {
    // Some create screens have no description field: retry with the essentials.
    const retry = await client.requestJira(route`/rest/api/3/issue`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ fields: { project: { key: project.key }, issuetype: { id: type.id }, summary: clip(summary, 240), labels } }),
    });
    created = await readJson(retry, 'Create issue');
  } else {
    created = await readJson(res, 'Create issue');
  }
  const link = await client.requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: { name: 'Relates' }, outwardIssue: { key: created.key }, inwardIssue: { key: linkTo } }),
  });
  if (!link.ok) {
    const err = new Error(`Created ${created.key} but could not link it to ${linkTo} (${link.status}). Link it manually.`);
    err.status = link.status;
    throw err;
  }
  return { key: created.key, id: created.id };
}

async function addComment(client, key, text) {
  const res = await client.requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: 'POST', headers: H, body: JSON.stringify({ body: adf(text) }),
  });
  return res.ok;
}

/** Move an issue back to a "To Do" status so it has to be verified again. */
async function reopen(client, key) {
  const res = await client.requestJira(route`/rest/api/3/issue/${key}/transitions`, { headers: H });
  const { transitions = [] } = await readJson(res, 'Get transitions');
  const back = transitions.find((t) => t.to?.statusCategory?.key === 'new')
    || transitions.find((t) => t.to?.statusCategory?.key === 'indeterminate');
  if (!back) return false;
  const r = await client.requestJira(route`/rest/api/3/issue/${key}/transitions`, {
    method: 'POST', headers: H, body: JSON.stringify({ transition: { id: back.id } }),
  });
  return r.ok;
}

/** Demo items created by a fix are tracked so "Remove demo issues" cleans them up too. */
async function trackDemo(projectKey, items) {
  if (!items.length) return;
  const state = await getSeedState(projectKey);
  if (!state?.refs) return;
  const refs = { ...state.refs };
  for (const it of items) refs[`FIX-${it.key}`] = it;
  await setSeedState(projectKey, { ...state, refs });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Jira search is eventually consistent: a new issue or link can take a few seconds to show up
 * in /search/jql. Wait (bounded) until the fix is visible, so the refreshed score is honest.
 */
async function waitUntilVisible(client, projectKey, { gapId, createdKeys, expectClosed }) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { graph } = await loadGraph(client, projectKey);
    const present = createdKeys.every((k) => graph.nodes.has(k));
    const closed = !expectClosed || !evaluate(graph).gaps.some((g) => g.id === gapId);
    if (present && closed) return true;
    await sleep(1500);
  }
  return false;
}

/**
 * Apply the remedy for one gap.
 * @param {*} client asUser() client
 * @param {{ projectKey: string, gapId: string }} input gapId looks like "REQ_VERIFIED:PUMP-5"
 */
export async function applyRemedy(client, { projectKey, gapId }) {
  if (!GAP_RE.test(String(gapId || ''))) throw new Error('Unknown gap.');
  if (gapId.split(':')[1].split('-')[0] !== projectKey) throw new Error('That gap belongs to another project.');

  const { graph } = await loadGraph(client, projectKey);
  const report = evaluate(graph);
  const gap = report.gaps.find((g) => g.id === gapId);
  if (!gap) return { applied: false, alreadyResolved: true, message: 'This gap is already closed. Refresh to see the latest score.' };
  if (!gap.remedy) return { applied: false, message: 'This gap needs a human decision, so there is no one-click fix. Follow the corrective action.' };

  const fw = getFramework(graph.config.framework);
  const { labels } = graph.config;
  const node = graph.nodes.get(gap.key);
  const demo = (node.labels || []).includes(DEMO_LABEL) ? [DEMO_LABEL] : [];
  const origin = `Created by Tracewell to close "${gap.title}" on ${gap.key} (${gap.clause}).`;
  const created = [];
  const updated = [];

  const project = gap.remedy.action === 'reverify' ? null : await getProject(client, projectKey);
  switch (gap.remedy.action) {
    case 'create-test': {
      created.push(await createLinked(client, {
        project, type: pickType(project, 'task'),
        summary: `Verify: ${node.summary}`,
        labels: [labels.test, ...(node.safety ? [labels.safety] : []), ...demo],
        description: adf(origin, `Acceptance: demonstrate that the system meets ${gap.key} ("${node.summary}"). Record the result, then move this ${fw.terms.test.toLowerCase()} to Done, or add the "${labels.failed}" label if it fails.`),
        linkTo: gap.key,
      }));
      break;
    }
    case 'create-control': {
      created.push(await createLinked(client, {
        project, type: pickType(project, 'task'),
        summary: `Risk control for: ${node.summary}`,
        labels: [labels.requirement, labels.safety, ...demo],
        description: adf(origin, `Define the ${fw.terms.requirement.toLowerCase()} that reduces the risk of ${gap.key}, then verify it with a ${fw.terms.test.toLowerCase()}.`),
        linkTo: gap.key,
      }));
      break;
    }
    case 'create-story': {
      created.push(await createLinked(client, {
        project, type: pickType(project, 'story'),
        summary: `Implement: ${node.summary}`,
        labels: demo,
        description: adf(origin),
        linkTo: gap.key,
      }));
      break;
    }
    case 'log-defect': {
      for (const testKey of gap.remedy.targets.slice(0, 5)) {
        const test = graph.nodes.get(testKey);
        created.push(await createLinked(client, {
          project, type: pickType(project, 'bug'),
          summary: `Defect: ${testKey} fails (${test?.summary || 'verification test'})`,
          labels: demo,
          description: adf(origin, `${testKey} verifies ${gap.key} ("${node.summary}") and is failing. Fix the defect or record a justified deviation, then re-run ${testKey}.`),
          linkTo: testKey,
        }));
      }
      break;
    }
    case 'reverify': {
      for (const testKey of gap.remedy.targets.slice(0, 10)) {
        const moved = await reopen(client, testKey);
        await addComment(client, testKey, `Re-verification required: ${gap.key} changed after this ${fw.terms.test.toLowerCase()} passed, so the earlier result no longer proves the current requirement (${gap.clause}). Re-run it against the new text and move it to Done when it passes. (Tracewell)`);
        updated.push({ key: testKey, reopened: moved });
      }
      if (updated.some((u) => !u.reopened)) {
        return { applied: true, created, updated, message: `Commented on ${updated.map((u) => u.key).join(', ')}, but could not move every test back to To Do. Re-open it from the issue.` };
      }
      break;
    }
    default:
      return { applied: false, message: 'Unknown fix.' };
  }

  await trackDemo(projectKey, created).catch(() => {});
  const keys = created.map((c) => c.key);
  const visible = await waitUntilVisible(client, projectKey, {
    gapId, createdKeys: keys, expectClosed: gap.remedy.action !== 'log-defect',
  }).catch(() => false);
  const message = gap.remedy.action === 'reverify'
    ? `Re-opened ${updated.map((u) => u.key).join(', ')} for re-verification against the changed ${gap.key}.`
    : `Created ${keys.join(', ')} and linked it to ${gap.remedy.action === 'log-defect' ? gap.remedy.targets.join(', ') : gap.key}.`;
  return { applied: true, gapId, action: gap.remedy.action, created, updated, message: visible ? message : `${message} Jira is still indexing the change, so refresh in a few seconds.` };
}
