// Tracewell compliance engine.
// Pure functions only (no Forge imports) so it is unit-testable and reusable by
// the UI resolvers, the Rovo agent actions, the MCP tools and the scheduler.

import { getFramework, normalizeConfig } from './frameworks.js';

export const SEVERITY_WEIGHT = { critical: 8, major: 3, minor: 1 };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };

export const CHECKS = {
  REQ_VERIFIED: { title: 'Requirement has verification', appliesTo: 'requirement' },
  REQ_TEST_PASS: { title: 'Verification tests pass', appliesTo: 'requirement' },
  REQ_TEST_CURRENT: { title: 'Verification is current (no suspect links)', appliesTo: 'requirement' },
  REQ_IMPLEMENTED: { title: 'Requirement is implemented', appliesTo: 'requirement' },
  HAZ_MITIGATED: { title: 'Hazard has a risk control', appliesTo: 'hazard' },
  HAZ_CONTROL_VERIFIED: { title: 'Risk control is verified', appliesTo: 'hazard' },
  TEST_TRACED: { title: 'Test traces to a requirement', appliesTo: 'test' },
};

const lower = (s) => String(s || '').toLowerCase();
const isHighPriority = (p) => ['highest', 'high', 'critical', 'blocker'].includes(lower(p));

/** Decide which trace role an issue plays. Labels win; issue type names are a fallback. */
export function classify(issue, labels) {
  const ls = (issue.labels || []).map(lower);
  const type = lower(issue.type);
  if (ls.includes(lower(labels.hazard)) || /hazard|risk/.test(type)) return 'hazard';
  if (ls.includes(lower(labels.test)) || /\btest\b|verification/.test(type)) return 'test';
  if (ls.includes(lower(labels.requirement)) || /requirement|control/.test(type)) return 'requirement';
  return 'implementation';
}

export function testResult(issue, labels) {
  const ls = (issue.labels || []).map(lower);
  if (ls.includes(lower(labels.failed)) || /fail/.test(lower(issue.status))) return 'failed';
  if (issue.statusCategory === 'done') return 'passed';
  return 'pending';
}

/**
 * Build the trace graph.
 * @param {Array} issues normalized issues: {key,id,summary,type,status,statusCategory,labels,priority,
 *   assignee,updated,resolved,created,fixVersions,links:[{key}],lastContentChange}
 */
export function buildGraph(issues, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const { labels } = config;
  const nodes = new Map();
  for (const i of issues) {
    nodes.set(i.key, {
      ...i,
      role: classify(i, labels),
      safety: (i.labels || []).map(lower).includes(lower(labels.safety)),
      neighbours: new Set(),
    });
  }
  for (const n of nodes.values()) {
    for (const l of n.links || []) {
      if (nodes.has(l.key) && l.key !== n.key) {
        n.neighbours.add(l.key);
        nodes.get(l.key).neighbours.add(n.key);
      }
    }
  }
  for (const n of nodes.values()) {
    if (n.role === 'test') n.result = testResult(n, labels);
  }
  return { nodes, config };
}

const linked = (graph, node, role) =>
  [...node.neighbours].map((k) => graph.nodes.get(k)).filter((n) => n && n.role === role);

const ts = (d) => (d ? new Date(d).getTime() : NaN);

/** A passed test is "suspect" when its requirement's content changed after the test passed. */
export function isSuspect(req, test) {
  if (test.result !== 'passed') return false;
  const changed = ts(req.lastContentChange);
  const verified = ts(test.resolved);
  if (Number.isNaN(changed) || Number.isNaN(verified)) return false;
  return changed > verified + 1000; // one-second tolerance for timestamp rounding
}

function requirementState(graph, req) {
  const tests = linked(graph, req, 'test');
  const impl = linked(graph, req, 'implementation');
  const hazards = linked(graph, req, 'hazard');
  const failing = tests.filter((t) => t.result === 'failed');
  const pending = tests.filter((t) => t.result === 'pending');
  const suspect = tests.filter((t) => isSuspect(req, t));
  let verdict = 'Verified';
  if (!tests.length) verdict = 'Unverified';
  else if (failing.length) verdict = 'Failing';
  else if (suspect.length) verdict = 'Suspect';
  else if (pending.length) verdict = 'In verification';
  return { tests, impl, hazards, failing, pending, suspect, verdict, safetyRelevant: req.safety || hazards.length > 0 };
}

/** Run every check and produce gaps, score and metrics. `scopeKeys` optionally limits requirements (release gate). */
export function evaluate(graph, { scopeKeys } = {}) {
  const fw = getFramework(graph.config.framework);
  const results = [];
  const gaps = [];
  const all = [...graph.nodes.values()];

  let requirements = all.filter((n) => n.role === 'requirement');
  if (scopeKeys) requirements = requirements.filter((r) => scopeKeys.has(r.key));
  const reqKeys = new Set(requirements.map((r) => r.key));
  let hazards = all.filter((n) => n.role === 'hazard');
  let tests = all.filter((n) => n.role === 'test');
  if (scopeKeys) {
    hazards = hazards.filter((h) => linked(graph, h, 'requirement').some((r) => reqKeys.has(r.key)));
    tests = tests.filter((t) => linked(graph, t, 'requirement').some((r) => reqKeys.has(r.key)));
  }

  const record = (checkId, node, pass, severity, detail, fix, remedy = null) => {
    results.push({ checkId, key: node.key, pass, severity });
    if (!pass) {
      gaps.push({
        id: `${checkId}:${node.key}`,
        checkId,
        severity,
        key: node.key,
        summary: node.summary,
        role: node.role,
        title: CHECKS[checkId].title,
        detail,
        fix,
        clause: fw.clauses[checkId],
        assignee: node.assignee || null,
        remedy,
      });
    }
  };

  const matrix = [];
  for (const req of requirements) {
    const s = requirementState(graph, req);
    const sev = s.safetyRelevant ? 'critical' : 'major';
    record('REQ_VERIFIED', req, s.tests.length > 0, sev,
      `No ${fw.terms.test.toLowerCase()} is linked to this ${fw.terms.requirement.toLowerCase()}.`,
      `Create a ${fw.terms.test.toLowerCase()} and link it to ${req.key}.`,
      { action: 'create-test', label: `Create ${fw.terms.test.toLowerCase()}` });
    if (s.tests.length) {
      record('REQ_TEST_PASS', req, s.failing.length === 0, sev,
        s.failing.length ? `Failing: ${s.failing.map((t) => t.key).join(', ')}.` : '',
        'Fix the defect or record a justified deviation, then re-run the test.',
        { action: 'log-defect', label: 'Log defect', targets: s.failing.map((t) => t.key) });
      record('REQ_TEST_CURRENT', req, s.suspect.length === 0, 'major',
        s.suspect.length ? `${req.key} changed after ${s.suspect.map((t) => t.key).join(', ')} passed.` : '',
        `Re-run ${s.suspect.map((t) => t.key).join(', ') || 'the linked tests'} against the changed requirement.`,
        { action: 'reverify', label: 'Re-open for re-verification', targets: s.suspect.map((t) => t.key) });
    }
    record('REQ_IMPLEMENTED', req, s.impl.length > 0, 'minor',
      'No implementation item (story, task or PR) is linked.',
      `Link the story or task that implements ${req.key}.`,
      { action: 'create-story', label: 'Create story' });
    matrix.push({
      key: req.key,
      summary: req.summary,
      status: req.status,
      safety: s.safetyRelevant,
      assignee: req.assignee || null,
      fixVersions: req.fixVersions || [],
      hazards: s.hazards.map((h) => h.key),
      implementation: s.impl.map((i) => ({ key: i.key, status: i.status, done: i.statusCategory === 'done' })),
      tests: s.tests.map((t) => ({ key: t.key, result: t.result, suspect: isSuspect(req, t) })),
      verdict: s.verdict,
    });
  }

  const hazardRows = [];
  for (const hz of hazards) {
    const reqs = linked(graph, hz, 'requirement');
    const high = isHighPriority(hz.priority);
    record('HAZ_MITIGATED', hz, reqs.length > 0, 'critical',
      `No ${fw.terms.requirement.toLowerCase()} is linked as a risk control.`,
      `Define a risk control ${fw.terms.requirement.toLowerCase()} and link it to ${hz.key}.`,
      { action: 'create-control', label: 'Create risk control' });
    let controlsVerified = false;
    if (reqs.length) {
      const weak = reqs.filter((r) => requirementState(graph, r).verdict !== 'Verified');
      controlsVerified = weak.length === 0;
      record('HAZ_CONTROL_VERIFIED', hz, controlsVerified, high ? 'critical' : 'major',
        weak.length ? `Controls not fully verified: ${weak.map((r) => r.key).join(', ')}.` : '',
        `Complete verification of ${weak.map((r) => r.key).join(', ') || 'the risk controls'}.`);
    }
    hazardRows.push({
      key: hz.key,
      summary: hz.summary,
      priority: hz.priority,
      controls: reqs.map((r) => r.key),
      verified: controlsVerified,
    });
  }

  for (const t of tests) {
    record('TEST_TRACED', t, linked(graph, t, 'requirement').length > 0, 'minor',
      `This ${fw.terms.test.toLowerCase()} does not trace to any requirement (orphan test).`,
      'Link it to the requirement it verifies, or retire it.');
  }

  let total = 0;
  let passed = 0;
  for (const r of results) {
    total += SEVERITY_WEIGHT[r.severity];
    if (r.pass) passed += SEVERITY_WEIGHT[r.severity];
  }
  const rawScore = total ? Math.round((100 * passed) / total) : null;
  gaps.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.key.localeCompare(b.key, undefined, { numeric: true }));

  const counts = { critical: 0, major: 0, minor: 0 };
  for (const g of gaps) counts[g.severity] += 1;
  const verdict = rawScore === null ? 'NO DATA' : counts.critical ? 'BLOCKED' : counts.major ? 'AT RISK' : 'READY';
  // Readiness bands keep the number honest: any critical gap caps the score below 60
  // (BLOCKED), any major gap caps it below 85 (AT RISK). Only READY scopes reach 85+.
  const score = rawScore === null ? null : counts.critical ? Math.min(rawScore, 59) : counts.major ? Math.min(rawScore, 84) : rawScore;

  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const metrics = {
    requirements: requirements.length,
    hazards: hazards.length,
    tests: tests.length,
    requirementsVerified: matrix.filter((m) => m.verdict === 'Verified').length,
    verificationCoverage: pct(matrix.filter((m) => m.tests.length > 0).length, matrix.length),
    hazardsControlled: pct(hazardRows.filter((h) => h.controls.length > 0).length, hazardRows.length),
    testsPassing: pct(tests.filter((t) => t.result === 'passed').length, tests.length),
    suspectLinks: matrix.reduce((n, m) => n + m.tests.filter((t) => t.suspect).length, 0),
    failingTests: tests.filter((t) => t.result === 'failed').length,
  };

  const verdictCounts = { Verified: 0, 'In verification': 0, Suspect: 0, Failing: 0, Unverified: 0 };
  for (const m of matrix) verdictCounts[m.verdict] += 1;

  return {
    framework: { id: fw.id, name: fw.name, shortName: fw.shortName, terms: fw.terms },
    score,
    rawScore,
    verdict,
    counts,
    metrics,
    verdictCounts,
    gaps,
    matrix,
    hazards: hazardRows,
    checksRun: results.length,
  };
}

/** Requirements in a release (fixVersion) — the release gate scope. */
export function releaseScope(graph, version) {
  const keys = new Set();
  for (const n of graph.nodes.values()) {
    if (n.role !== 'requirement') continue;
    const inRelease = (n.fixVersions || []).includes(version);
    const viaImpl = linked(graph, n, 'implementation').some((i) => (i.fixVersions || []).includes(version));
    if (inRelease || viaImpl) keys.add(n.key);
  }
  return keys;
}

/** Everything that must be re-assessed if `key` changes. */
export function impactAnalysis(graph, key) {
  const fw = getFramework(graph.config.framework);
  const start = graph.nodes.get(key);
  if (!start) return null;
  const reqs = new Map();
  const add = (r) => r && reqs.set(r.key, r);
  if (start.role === 'requirement') add(start);
  for (const n of linked(graph, start, 'requirement')) add(n);
  // a changed test or implementation item can touch several requirements
  const tests = new Map();
  const hazards = new Map();
  const impl = new Map();
  for (const r of reqs.values()) {
    for (const t of linked(graph, r, 'test')) tests.set(t.key, t);
    for (const h of linked(graph, r, 'hazard')) hazards.set(h.key, h);
    for (const i of linked(graph, r, 'implementation')) impl.set(i.key, i);
  }
  if (start.role === 'hazard') {
    for (const r of reqs.values()) for (const t of linked(graph, r, 'test')) tests.set(t.key, t);
  }
  const pick = (n) => ({ key: n.key, summary: n.summary, status: n.status, safety: !!n.safety, result: n.result });
  const actions = [];
  if (tests.size) actions.push(`Re-run ${tests.size} ${fw.terms.test.toLowerCase()}(s): ${[...tests.keys()].join(', ')}.`);
  if (hazards.size) actions.push(`Re-assess ${hazards.size} ${fw.terms.hazard.toLowerCase()}(s) and their risk controls: ${[...hazards.keys()].join(', ')} (${fw.clauses.REQ_TEST_CURRENT}).`);
  if ([...reqs.values()].some((r) => r.safety || linked(graph, r, 'hazard').length)) actions.push('Change touches safety-relevant scope: record a change impact analysis before release.');
  if (!actions.length) actions.push('No downstream trace items found. Confirm the item is linked correctly.');
  const riskLevel = hazards.size ? 'high' : tests.size > 2 ? 'medium' : 'low';
  return {
    item: { key: start.key, summary: start.summary, role: start.role },
    riskLevel,
    requirements: [...reqs.values()].filter((r) => r.key !== start.key).map(pick),
    tests: [...tests.values()].map(pick),
    hazards: [...hazards.values()].map(pick),
    implementation: [...impl.values()].filter((i) => i.key !== start.key).map(pick),
    actions,
  };
}

/** Upstream/downstream view for a single issue (issue panel and trace-item tool). */
export function traceItem(graph, key) {
  const n = graph.nodes.get(key);
  if (!n) return null;
  const report = evaluate(graph);
  const pick = (x) => ({ key: x.key, summary: x.summary, status: x.status, role: x.role, result: x.result, safety: !!x.safety });
  return {
    key: n.key,
    summary: n.summary,
    role: n.role,
    safety: n.safety,
    status: n.status,
    result: n.result,
    links: {
      requirements: linked(graph, n, 'requirement').map(pick),
      hazards: linked(graph, n, 'hazard').map(pick),
      tests: linked(graph, n, 'test').map((t) => ({ ...pick(t), suspect: n.role === 'requirement' ? isSuspect(n, t) : false })),
      implementation: linked(graph, n, 'implementation').map(pick),
    },
    verdict: report.matrix.find((m) => m.key === key)?.verdict || null,
    gaps: report.gaps.filter((g) => g.key === key),
    framework: report.framework,
  };
}
