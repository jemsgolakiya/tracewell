// Audit dossier export: writes a complete, reviewable traceability report to Confluence.
import api, { route } from '@forge/api';
import { readJson } from './jira.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const issueLink = (key) => `<a href="/browse/${esc(key)}">${esc(key)}</a>`;
const keys = (list) => (list.length ? list.map(issueLink).join(', ') : '<em>none</em>');
const status = (title, colour) =>
  `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${colour}</ac:parameter><ac:parameter ac:name="title">${esc(title)}</ac:parameter></ac:structured-macro>`;
const panel = (kind, html) => `<ac:structured-macro ac:name="${kind}"><ac:rich-text-body>${html}</ac:rich-text-body></ac:structured-macro>`;

const VERDICT_COLOUR = { READY: 'Green', 'AT RISK': 'Yellow', BLOCKED: 'Red', 'NO DATA': 'Grey' };
const ROW_COLOUR = { Verified: 'Green', 'In verification': 'Blue', Suspect: 'Yellow', Failing: 'Red', Unverified: 'Red' };
const SEV_COLOUR = { critical: 'Red', major: 'Yellow', minor: 'Grey' };

/**
 * Cross-product call from a Jira module. Try as the signed-in user first (respects Confluence
 * permissions). If the user has not yet granted the app consent in Confluence (401/403), fall
 * back to the app identity so the export still works. The page is then authored by Tracewell.
 */
async function confluenceRequest(path, options) {
  try {
    const res = await api.asUser().requestConfluence(path, options);
    if (res.status !== 401 && res.status !== 403) return res;
  } catch (e) {
    console.warn('Confluence asUser call failed, retrying as app:', e.message);
  }
  return api.asApp().requestConfluence(path, options);
}

export async function listSpaces() {
  const res = await confluenceRequest(route`/wiki/api/v2/spaces?limit=50&status=current&type=global`, { headers: { Accept: 'application/json' } });
  const body = await readJson(res, 'Confluence space lookup');
  return (body.results || []).map((s) => ({ id: s.id, key: s.key, name: s.name }));
}

export function dossierStorage({ report, projectKey, projectName, fixVersion, preparedBy, generatedAt }) {
  const fw = report.framework;
  const scope = fixVersion ? `Release <strong>${esc(fixVersion)}</strong> of ${esc(projectName)} (${esc(projectKey)})` : `${esc(projectName)} (${esc(projectKey)}), all items`;
  const m = report.metrics;
  const summary = `
<h2>1. Summary</h2>
<table><tbody>
<tr><th>Scope</th><td>${scope}</td></tr>
<tr><th>Framework</th><td>${esc(fw.name)}</td></tr>
<tr><th>Audit readiness</th><td><strong>${report.score ?? '–'} / 100</strong> ${status(report.verdict, VERDICT_COLOUR[report.verdict])}</td></tr>
<tr><th>Open gaps</th><td>${status(`${report.counts.critical} critical`, 'Red')} ${status(`${report.counts.major} major`, 'Yellow')} ${status(`${report.counts.minor} minor`, 'Grey')}</td></tr>
<tr><th>Verification coverage</th><td>${m.verificationCoverage ?? '–'}% of ${m.requirements} ${esc(fw.terms.requirement.toLowerCase())}s have linked tests</td></tr>
<tr><th>Risk controls in place</th><td>${m.hazardsControlled ?? '–'}% of ${m.hazards} ${esc(fw.terms.hazard.toLowerCase())}s</td></tr>
<tr><th>Tests passing</th><td>${m.testsPassing ?? '–'}% of ${m.tests} (${m.failingTests} failing, ${m.suspectLinks} suspect)</td></tr>
<tr><th>Generated</th><td>${esc(generatedAt)} by Tracewell for ${esc(preparedBy || 'the current user')}. ${report.checksRun} checks evaluated.</td></tr>
</tbody></table>`;

  const verdictNote = report.verdict === 'READY'
    ? panel('info', '<p>No critical or major gaps were found. This scope is ready for review.</p>')
    : panel('warning', `<p>This scope is <strong>${esc(report.verdict)}</strong>. Resolve the gaps in section 4 before release or audit.</p>`);

  const matrix = `
<h2>2. Traceability matrix</h2>
<table><tbody>
<tr><th>${esc(fw.terms.requirement)}</th><th>Summary</th><th>${esc(fw.terms.hazard)}s</th><th>Implementation</th><th>Verification</th><th>Status</th></tr>
${report.matrix.map((r) => `<tr>
<td>${issueLink(r.key)}${r.safety ? ` ${status('SAFETY', 'Purple')}` : ''}</td>
<td>${esc(r.summary)}</td>
<td>${keys(r.hazards)}</td>
<td>${keys(r.implementation.map((i) => i.key))}</td>
<td>${r.tests.length ? r.tests.map((t) => `${issueLink(t.key)} (${esc(t.suspect ? 'suspect' : t.result)})`).join('<br/>') : '<em>none</em>'}</td>
<td>${status(r.verdict, ROW_COLOUR[r.verdict] || 'Grey')}</td>
</tr>`).join('')}
</tbody></table>`;

  const hazards = `
<h2>3. Risk control verification</h2>
<table><tbody>
<tr><th>${esc(fw.terms.hazard)}</th><th>Summary</th><th>Severity</th><th>Risk controls</th><th>Controls verified</th></tr>
${report.hazards.map((h) => `<tr><td>${issueLink(h.key)}</td><td>${esc(h.summary)}</td><td>${esc(h.priority || '–')}</td><td>${keys(h.controls)}</td><td>${h.controls.length ? status(h.verified ? 'YES' : 'NO', h.verified ? 'Green' : 'Red') : status('NO CONTROL', 'Red')}</td></tr>`).join('')}
</tbody></table>`;

  const gaps = `
<h2>4. Open gaps and corrective actions</h2>
${report.gaps.length ? `<table><tbody>
<tr><th>Severity</th><th>Item</th><th>Finding</th><th>Clause</th><th>Corrective action</th><th>Owner</th></tr>
${report.gaps.map((g) => `<tr><td>${status(g.severity.toUpperCase(), SEV_COLOUR[g.severity])}</td><td>${issueLink(g.key)}</td><td><strong>${esc(g.title)}</strong><br/>${esc(g.detail)}</td><td>${esc(g.clause)}</td><td>${esc(g.fix)}</td><td>${esc(g.assignee?.displayName || 'Unassigned')}</td></tr>`).join('')}
</tbody></table>` : '<p>No open gaps.</p>'}`;

  const signoff = `
<h2>5. Review and approval</h2>
<table><tbody>
<tr><th>Role</th><th>Name</th><th>Decision</th><th>Date</th></tr>
<tr><td>Prepared by</td><td>${esc(preparedBy || '')}</td><td></td><td>${esc(generatedAt.slice(0, 10))}</td></tr>
<tr><td>Software lead</td><td></td><td></td><td></td></tr>
<tr><td>Quality / Regulatory affairs</td><td></td><td></td><td></td></tr>
</tbody></table>
<p><em>Generated from live Jira data by Tracewell. Re-export after changes; Jira remains the system of record.</em></p>`;

  return `${verdictNote}${summary}${matrix}${hazards}${gaps}${signoff}`;
}

export async function createDossierPage({ spaceId, title, body }) {
  const res = await confluenceRequest(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId, status: 'current', title, body: { representation: 'storage', value: body } }),
  });
  const page = await readJson(res, 'Confluence page creation');
  const base = page._links?.base || '';
  return { id: page.id, title: page.title, url: page._links?.webui ? `${base}${page._links.webui}` : null };
}
