// End-to-end flow against in-memory fakes of Jira, Confluence, Teamwork Graph and KVS.
// The real src/ code is bundled with @forge/* aliased to the fakes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

let app; let fake;
const dir = path.resolve('test/.build');

before(async () => {
  mkdirSync(dir, { recursive: true });
  const res = await build({
    entryPoints: ['test/fakes/entry.js'], bundle: true, write: false, platform: 'node', format: 'esm',
    alias: { '@forge/api': './test/fakes/forge-api.js', '@forge/kvs': './test/fakes/forge-kvs.js', '@forge/resolver': './test/fakes/forge-resolver.js' },
    logLevel: 'error',
  });
  writeFileSync(path.join(dir, 'app.mjs'), res.outputFiles[0].text);
  const mod = await import(path.join(dir, 'app.mjs'));
  app = mod.app; fake = mod.fake;
});

const ctx = { extension: { project: { key: 'PUMP' } }, cloudId: 'cloud-1' };
const callR = async (name, payload = {}, context = ctx) => {
  const r = await app.handler[name]({ payload, context });
  assert.equal(r.ok, true, `${name} failed: ${r.error}`);
  return r.data;
};

test('empty project shows onboarding data', async () => {
  const d = await callR('getOverview');
  assert.equal(d.report.verdict, 'NO DATA');
  assert.equal(d.hasDemo, false);
  assert.equal(d.frameworks.length, 3);
});

test('seeding builds the PumpOS demo through the real Jira calls', async () => {
  fake.mode.createScreenWithoutFixVersions = true; // fix versions must be set via the edit screen
  for (const step of ['create', 'link', 'transition', 'transition-tests', 'edit']) {
    await callR('seedStep', { step });
  }
  fake.mode.createScreenWithoutFixVersions = false;
  assert.equal(fake.state.issues.size, 26);
  assert.equal(fake.state.links.length, 17);
  assert.equal([...fake.state.issues.values()].filter((i) => i.fixVersions.includes('v2.1')).length, 8);
  assert.deepEqual(fake.state.versions.map((v) => v.name).sort(), ['v2.1', 'v2.2']);
  const again = await callR('seedStep', { step: 'create' });
  assert.equal(fake.state.issues.size, 26, 'create step is idempotent');
  assert.ok(again.done);
});

test('overview after seeding matches the engine expectations (incl. suspect link from changelog)', async () => {
  const d = await callR('getOverview');
  assert.equal(d.report.verdict, 'BLOCKED');
  assert.deepEqual(d.report.counts, { critical: 4, major: 2, minor: 2 });
  assert.equal(d.report.metrics.suspectLinks, 1);
  assert.equal(d.changelogOk, true);
  assert.equal(d.trend.length, 1);
  assert.equal(d.hasDemo, true);
  assert.deepEqual(d.versions.map((v) => v.name).sort(), ['v2.1', 'v2.2']);
  const gate = await callR('getOverview', { fixVersion: 'v2.1' });
  assert.equal(gate.report.metrics.requirements, 4);
});

test('issue panel trace includes Teamwork Graph evidence and impact', async () => {
  const d = await callR('getTrace', {}, { extension: { issue: { key: 'PUMP-1' } }, cloudId: 'cloud-1' });
  assert.equal(d.trace.role, 'requirement');
  assert.equal(d.trace.verdict, 'Verified');
  assert.equal(d.evidence.available, true);
  assert.equal(d.evidence.items[0].pullRequests[0].title, 'PUMP-21 occlusion cut-off');
  assert.ok(d.impact.actions.length >= 1);
  assert.ok(fake.state.calls.some((c) => c.startsWith('TWG tracewell_workItemPullRequests')));
});

test('settings are validated and change the framework', async () => {
  const saved = await callR('saveConfig', { config: { framework: 'iso26262', labels: { requirement: 'tw req' } } });
  assert.equal(saved.labels.requirement, 'tw-req');
  const d = await callR('getOverview');
  assert.equal(d.report.framework.shortName, 'ISO 26262');
  await callR('saveConfig', { config: { framework: 'iec62304' } });
});

test('audit dossier is written to Confluence', async () => {
  const spaces = await callR('listSpaces');
  const page = await callR('exportDossier', { spaceId: spaces[0].id, projectName: 'PumpOS' });
  assert.equal(page.url, 'https://example.atlassian.net/wiki/spaces/QA/pages/555');
  const body = fake.state.pages[0].body.value;
  assert.ok(body.includes('Traceability matrix') && body.includes('BLOCKED') && body.includes('Jemish Golakiya'));
  assert.ok(!body.includes('<script'));
});

test('Rovo/MCP actions answer from live data', async () => {
  const r = await app.getReadiness({ projectKey: 'pump', fixVersion: 'v2.1' });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'BLOCKED');
  const gaps = await app.listGaps({ context: { jira: { projectKey: 'PUMP' } }, severity: 'critical' });
  assert.equal(gaps.total, 4);
  const t = await app.traceRequirement({ issueKey: 'PUMP-3', context: { cloudId: 'cloud-1' } });
  assert.equal(t.item.verdict, 'Failing');
  const i = await app.analyzeImpact({ issueKey: 'PUMP-2' });
  assert.equal(i.riskLevel, 'high');
  const missing = await app.getReadiness({});
  assert.equal(missing.ok, false);
  const injected = await app.traceRequirement({ issueKey: 'PUMP-1"; DROP' });
  assert.equal(injected.ok, false);
});

test('MCP fallback to app identity requires a permission check', async () => {
  fake.mode.asUserThrows = true;
  const denied = await app.getReadiness({ projectKey: 'PUMP', context: { accountId: 'stranger' } });
  assert.equal(denied.ok, false);
  const allowed = await app.getReadiness({ projectKey: 'PUMP', context: { accountId: 'allowed' } });
  assert.equal(allowed.ok, true);
  fake.mode.asUserThrows = false;
});

test('daily snapshot runs for tracked projects', async () => {
  await app.dailySnapshot();
  const d = await callR('getOverview');
  assert.equal(d.trend.length, 1); // same day overwrites
});

test('confluence macro reads readiness for a configured project', async () => {
  const d = await callR('getMacroReadiness', {}, { extension: { config: { projectKey: 'PUMP' } } });
  assert.equal(d.verdict, 'BLOCKED');
  const empty = await callR('getMacroReadiness', {}, { extension: {} });
  assert.equal(empty.needsConfig, true);
});

test('dossier export falls back to the app identity when Confluence consent is missing', async () => {
  fake.mode.confluenceUser401 = true;
  const spaces = await callR('listSpaces');
  const page = await callR('exportDossier', { spaceId: spaces[0].id, fixVersion: 'v2.1', projectName: 'PumpOS' });
  assert.ok(page.title.includes('v2.1'));
  fake.mode.confluenceUser401 = false;
});

test('confluence macro falls back only for viewers who can browse the project', async () => {
  fake.mode.asUserThrows = true;
  const denied = await app.handler.getMacroReadiness({ payload: {}, context: { accountId: 'stranger', extension: { config: { projectKey: 'PUMP' } } } });
  assert.equal(denied.ok, false);
  const allowed = await callR('getMacroReadiness', { fixVersion: 'v2.1' }, { accountId: 'allowed', extension: { config: { projectKey: 'PUMP' } } });
  assert.equal(allowed.fixVersion, 'v2.1');
  fake.mode.asUserThrows = false;
});

const gapsOf = (d, key) => d.report.gaps.filter((g) => g.key === key).map((g) => g.checkId);

test('one-click fix: create the missing verification test', async () => {
  const before = await callR('getOverview');
  const gap = before.report.gaps.find((g) => g.id === 'REQ_VERIFIED:PUMP-5');
  assert.equal(gap.remedy.action, 'create-test');
  const r = await callR('applyRemedy', { gapId: gap.id });
  assert.equal(r.applied, true);
  assert.equal(r.created.length, 1);
  const created = fake.state.issues.get(r.created[0].key);
  assert.match(created.summary, /^Verify: /);
  assert.ok(created.labels.includes('tw-test') && created.labels.includes('tracewell-demo'));
  assert.ok(fake.state.links.some((l) => l.a === created.key && l.b === 'PUMP-5'));
  const after = await callR('getOverview');
  assert.ok(!gapsOf(after, 'PUMP-5').includes('REQ_VERIFIED'));
  assert.equal(after.report.matrix.find((m) => m.key === 'PUMP-5').verdict, 'In verification');
  const again = await callR('applyRemedy', { gapId: gap.id });
  assert.equal(again.alreadyResolved, true, 'a second click never creates duplicates');
  assert.equal(fake.state.issues.size, 27);
});

test('one-click fix: re-open a suspect test for re-verification', async () => {
  const r = await callR('applyRemedy', { gapId: 'REQ_TEST_CURRENT:PUMP-4' });
  assert.equal(r.applied, true);
  assert.deepEqual(r.updated.map((u) => u.key), ['PUMP-17']);
  const test17 = fake.state.issues.get('PUMP-17');
  assert.equal(test17.cat, 'new');
  assert.match(test17.comments[0].content[0].content[0].text, /Re-verification required: PUMP-4 changed/);
  const after = await callR('getOverview');
  assert.equal(after.report.metrics.suspectLinks, 0);
  assert.equal(after.report.matrix.find((m) => m.key === 'PUMP-4').verdict, 'In verification');
});

test('Rovo/MCP fix action: risk control for an unmitigated hazard, defect for a failing test', async () => {
  const ctl = await app.fixGap({ issueKey: 'PUMP-12' }, {});
  assert.equal(ctl.ok, true);
  assert.equal(ctl.action, 'create-control');
  const control = fake.state.issues.get(ctl.created[0].key);
  assert.ok(control.labels.includes('tw-req') && control.labels.includes('tw-safety'));
  const after = await callR('getOverview');
  assert.ok(!gapsOf(after, 'PUMP-12').includes('HAZ_MITIGATED'));
  assert.ok(gapsOf(after, control.key).includes('REQ_VERIFIED'), 'the new control is honestly unverified');

  const defect = await app.fixGap({ issueKey: 'PUMP-3', finding: 'req_test_pass' }, {});
  assert.equal(defect.action, 'log-defect');
  assert.ok(fake.state.links.some((l) => l.a === defect.created[0].key && l.b === 'PUMP-16'));

  const none = await app.fixGap({ issueKey: 'PUMP-1' }, {});
  assert.equal(none.applied, false);
  const badFinding = await app.fixGap({ issueKey: 'PUMP-1', finding: 'DROP_TABLE' }, {});
  assert.equal(badFinding.ok, false);
});

test('fixes run only as the user and stay inside the project', async () => {
  const count = fake.state.issues.size;
  fake.mode.asUserThrows = true;
  const r = await app.fixGap({ issueKey: 'PUMP-7' }, { principal: { accountId: 'allowed' } });
  fake.mode.asUserThrows = false;
  assert.equal(r.ok, false, 'no app-identity fallback for writes');
  assert.equal(fake.state.issues.size, count);
  const cross = await app.handler.applyRemedy({ payload: { gapId: 'REQ_VERIFIED:OTHER-5' }, context: ctx });
  assert.equal(cross.ok, false);
  const junk = await app.handler.applyRemedy({ payload: { gapId: 'x' }, context: ctx });
  assert.equal(junk.ok, false);
});

test('demo removal keeps state when the user lacks Delete issues permission', async () => {
  fake.mode.deleteForbidden = true;
  const r = await app.handler.removeDemo({ payload: {}, context: ctx });
  assert.equal(r.ok, false);
  assert.match(r.error, /Delete issues/);
  fake.mode.deleteForbidden = false;
  const d = await callR('getOverview');
  assert.equal(d.hasDemo, true, 'seed state must survive a failed removal');
});

test('demo can be removed cleanly', async () => {
  const r = await callR('removeDemo');
  assert.equal(r.removed, 29, 'demo issues created by fixes are removed too');
  assert.equal(fake.state.issues.size, 0);
});
