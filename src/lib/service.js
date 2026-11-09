// Shared use-cases behind the UI, the Rovo agent, the MCP tools and the scheduler.
import { buildGraph, evaluate, releaseScope, impactAnalysis, traceItem, classify } from './engine.js';
import { loadProjectIssues, getVersions, getProject, getIssue } from './jira.js';
import { getConfig, recordSnapshot, getSnapshots, trackProject } from './storage.js';
import { normalizeConfig } from './frameworks.js';
import { evidenceFor } from './twg.js';

export async function loadGraph(client, projectKey) {
  const config = await getConfig(projectKey);
  const labels = normalizeConfig(config).labels;
  const { issues, changelogOk } = await loadProjectIssues(client, projectKey, {
    roleFilter: (i) => classify(i, labels) === 'requirement',
  });
  return { graph: buildGraph(issues, config), config, changelogOk, issueCount: issues.length };
}

export async function readinessReport(client, projectKey, { fixVersion, snapshot = false } = {}) {
  const { graph, config, changelogOk, issueCount } = await loadGraph(client, projectKey);
  const scopeKeys = fixVersion ? releaseScope(graph, fixVersion) : undefined;
  const report = evaluate(graph, { scopeKeys });
  let trend = [];
  if (!fixVersion && snapshot) {
    trend = await recordSnapshot(projectKey, report);
    await trackProject(projectKey);
  } else if (!fixVersion) {
    trend = await getSnapshots(projectKey);
  }
  return { projectKey, fixVersion: fixVersion || null, report, config, changelogOk, issueCount, trend };
}

export async function overview(client, projectKey, { fixVersion } = {}) {
  const [data, versions, project] = await Promise.all([
    readinessReport(client, projectKey, { fixVersion, snapshot: true }),
    getVersions(client, projectKey).catch(() => []),
    getProject(client, projectKey).catch(() => ({ name: projectKey })),
  ]);
  return { ...data, versions, projectName: project.name };
}

export async function trace(client, issueKey, { cloudId, withEvidence = true } = {}) {
  const issue = await getIssue(client, issueKey);
  const { graph } = await loadGraph(client, issue.projectKey);
  const t = traceItem(graph, issue.key);
  if (!t) return { issueKey, projectKey: issue.projectKey, notTraced: true };
  const impact = impactAnalysis(graph, issue.key);
  let evidence = null;
  if (withEvidence && cloudId) {
    const implKeys = t.role === 'implementation' ? [t.key] : t.links.implementation.map((i) => i.key);
    const implItems = implKeys.map((k) => graph.nodes.get(k)).filter(Boolean);
    evidence = implItems.length ? await evidenceFor(cloudId, implItems).catch((e) => ({ available: false, items: [], notes: [e.message] })) : { available: true, items: [], notes: [] };
  }
  return { issueKey: issue.key, projectKey: issue.projectKey, trace: t, impact, evidence };
}

export async function impact(client, issueKey) {
  const issue = await getIssue(client, issueKey);
  const { graph } = await loadGraph(client, issue.projectKey);
  return impactAnalysis(graph, issue.key);
}

export { getVersions };
