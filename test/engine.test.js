import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, evaluate, impactAnalysis, releaseScope, traceItem, classify, isSuspect } from '../src/lib/engine.js';
import { DEFAULT_CONFIG } from '../src/lib/frameworks.js';
import { demoAsIssues } from '../src/lib/demoData.js';

const labels = DEFAULT_CONFIG.labels;
const issues = demoAsIssues(labels);
const graph = buildGraph(issues, DEFAULT_CONFIG);
const report = evaluate(graph);
const gapIds = report.gaps.map((g) => g.id);

test('classifies demo items by label', () => {
  const roles = {};
  for (const n of graph.nodes.values()) roles[n.role] = (roles[n.role] || 0) + 1;
  assert.deepEqual(roles, { requirement: 7, hazard: 5, test: 8, implementation: 6 });
  assert.equal(classify({ labels: [], type: 'Hazard' }, labels), 'hazard');
  assert.equal(classify({ labels: [], type: 'Story' }, labels), 'implementation');
});

test('finds exactly the critical gaps a notified body would flag', () => {
  const critical = report.gaps.filter((g) => g.severity === 'critical').map((g) => g.id).sort();
  assert.deepEqual(critical, [
    'HAZ_CONTROL_VERIFIED:PUMP-10', // H3 -> R3 failing
    'HAZ_CONTROL_VERIFIED:PUMP-11', // H4 -> R6 still in verification
    'HAZ_MITIGATED:PUMP-12', // H5 has no risk control
    'REQ_TEST_PASS:PUMP-3', // R3 alarm test failing
  ]);
});

test('detects the suspect link created by editing R4 after its test passed', () => {
  assert.ok(gapIds.includes('REQ_TEST_CURRENT:PUMP-4'));
  assert.equal(report.metrics.suspectLinks, 1);
  const r4 = report.matrix.find((m) => m.key === 'PUMP-4');
  assert.equal(r4.verdict, 'Suspect');
});

test('flags unverified, unimplemented and orphan items', () => {
  assert.ok(gapIds.includes('REQ_VERIFIED:PUMP-5'));
  assert.ok(gapIds.includes('REQ_IMPLEMENTED:PUMP-7'));
  assert.ok(gapIds.includes('TEST_TRACED:PUMP-20'));
  assert.equal(report.gaps.find((g) => g.id === 'REQ_VERIFIED:PUMP-5').severity, 'major');
});

test('scores and verdicts are sane', () => {
  assert.equal(report.verdict, 'BLOCKED');
  assert.ok(report.score <= 59, `blocked scopes are capped below 60, got ${report.score}`);
  assert.ok(report.rawScore > report.score);
  assert.deepEqual(report.counts, { critical: 4, major: 2, minor: 2 });
  assert.equal(report.metrics.requirements, 7);
  assert.equal(report.verdictCounts.Verified, 3);
  assert.ok(report.gaps[0].clause.startsWith('IEC 62304') || report.gaps[0].clause.startsWith('ISO 14971'));
});

test('release gate scopes to a fixVersion', () => {
  const scope = releaseScope(graph, 'v2.1');
  assert.deepEqual([...scope].sort(), ['PUMP-1', 'PUMP-2', 'PUMP-3', 'PUMP-5']);
  const gate = evaluate(graph, { scopeKeys: scope });
  assert.equal(gate.verdict, 'BLOCKED');
  assert.equal(gate.metrics.hazards, 3);
});

test('fixing the failing test unblocks the v2.1 release (demo storyline)', () => {
  const fixed = issues.map((i) => (i.key === 'PUMP-16'
    ? { ...i, labels: i.labels.filter((l) => l !== labels.failed), status: 'Done', statusCategory: 'done', resolved: '2026-11-08T10:00:00Z' }
    : i));
  const g = buildGraph(fixed, DEFAULT_CONFIG);
  const gate = evaluate(g, { scopeKeys: releaseScope(g, 'v2.1') });
  assert.equal(gate.counts.critical, 0);
  assert.equal(gate.verdict, 'AT RISK'); // R5 battery display still unverified
  assert.ok(gate.score >= 60 && gate.score <= 84);
});

test('impact analysis for a safety requirement', () => {
  const impact = impactAnalysis(graph, 'PUMP-2');
  assert.equal(impact.riskLevel, 'high');
  assert.deepEqual(impact.tests.map((t) => t.key).sort(), ['PUMP-14', 'PUMP-15']);
  assert.deepEqual(impact.hazards.map((h) => h.key), ['PUMP-9']);
  assert.ok(impact.actions.some((a) => a.includes('Re-run 2')));
});

test('impact analysis from an implementation story walks up to tests', () => {
  const impact = impactAnalysis(graph, 'PUMP-23'); // S3 alarm service
  assert.deepEqual(impact.requirements.map((r) => r.key), ['PUMP-3']);
  assert.deepEqual(impact.tests.map((t) => t.key), ['PUMP-16']);
});

test('trace item returns links and gaps', () => {
  const t = traceItem(graph, 'PUMP-3');
  assert.equal(t.role, 'requirement');
  assert.equal(t.verdict, 'Failing');
  assert.equal(t.links.hazards[0].key, 'PUMP-10');
  assert.ok(t.gaps.length >= 1);
  assert.equal(traceItem(graph, 'NOPE-1'), null);
});

test('suspect detection tolerates missing dates', () => {
  assert.equal(isSuspect({ lastContentChange: null }, { result: 'passed', resolved: '2026-01-01' }), false);
  assert.equal(isSuspect({ lastContentChange: '2026-01-02' }, { result: 'pending', resolved: null }), false);
});

test('framework packs change clause references', () => {
  const g = buildGraph(issues, { ...DEFAULT_CONFIG, framework: 'soc2' });
  const r = evaluate(g);
  assert.equal(r.framework.shortName, 'SOC 2');
  assert.ok(r.gaps.every((x) => /SOC 2|ISO 27001/.test(x.clause)));
});

test('empty project yields NO DATA rather than crashing', () => {
  const r = evaluate(buildGraph([], DEFAULT_CONFIG));
  assert.equal(r.verdict, 'NO DATA');
  assert.equal(r.score, null);
});
