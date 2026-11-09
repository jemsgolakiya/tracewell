// Demo dataset: "PumpOS", a fictional insulin pump controller (IEC 62304 class C).
// Used by the one-click demo seeder and by the unit tests, so the demo a judge
// sees is exactly the scenario the engine is tested against.
//
// role: requirement | hazard | test | implementation
// state: todo | inprogress | done      failed: adds the "failed" label to a test
// editAfterVerify: the requirement text is changed after its test passed -> suspect link

export const DEMO_PROJECT_NAME = 'PumpOS (Tracewell demo)';

export const DEMO_ITEMS = [
  // ---- Software requirements -------------------------------------------------
  { ref: 'R1', role: 'requirement', safety: true, state: 'done', fixVersion: 'v2.1',
    summary: 'Stop insulin delivery within 2 s when an occlusion is detected' },
  { ref: 'R2', role: 'requirement', safety: true, state: 'done', fixVersion: 'v2.1',
    summary: "Reject any bolus above the patient's configured maximum dose" },
  { ref: 'R3', role: 'requirement', safety: true, state: 'done', fixVersion: 'v2.1',
    summary: 'Raise an audible alarm when the reservoir drops below 10 units' },
  { ref: 'R4', role: 'requirement', safety: false, state: 'done', fixVersion: 'v2.2', editAfterVerify: true,
    summary: 'Log every dose event with a timestamp to tamper-evident storage',
    editedSummary: 'Log every dose event with a UTC timestamp and device ID to tamper-evident storage' },
  { ref: 'R5', role: 'requirement', safety: false, state: 'done', fixVersion: 'v2.1',
    summary: 'Show remaining battery percentage on the home screen' },
  { ref: 'R6', role: 'requirement', safety: true, state: 'inprogress', fixVersion: 'v2.2',
    summary: 'Pair with the glucose sensor only over BLE Secure Connections (LE SC)' },
  { ref: 'R7', role: 'requirement', safety: false, state: 'done', fixVersion: 'v2.2',
    summary: 'Resume basal delivery automatically after a power cycle' },

  // ---- Hazards (ISO 14971) ---------------------------------------------------
  { ref: 'H1', role: 'hazard', priority: 'High', state: 'done',
    summary: 'Undetected occlusion causes missed insulin delivery (hyperglycaemia)', links: ['R1'] },
  { ref: 'H2', role: 'hazard', priority: 'Highest', state: 'done',
    summary: 'Bolus over-delivery causes severe hypoglycaemia', links: ['R2'] },
  { ref: 'H3', role: 'hazard', priority: 'High', state: 'done',
    summary: 'Patient is not aware the reservoir is empty', links: ['R3'] },
  { ref: 'H4', role: 'hazard', priority: 'Highest', state: 'inprogress',
    summary: 'Unauthorised remote bolus command over Bluetooth', links: ['R6'] },
  { ref: 'H5', role: 'hazard', priority: 'High', state: 'todo',
    summary: 'Wrong dose calculation after a time-zone change', links: [] },

  // ---- Verification tests ----------------------------------------------------
  { ref: 'T1', role: 'test', state: 'done', summary: 'VT-101 Occlusion detection stops motor within 2 s', links: ['R1'] },
  { ref: 'T2', role: 'test', state: 'done', summary: 'VT-102 Bolus above max dose is rejected', links: ['R2'] },
  { ref: 'T3', role: 'test', state: 'done', summary: 'VT-103 Max dose boundary values (0, max, max+0.05 U)', links: ['R2'] },
  { ref: 'T4', role: 'test', state: 'inprogress', failed: true, summary: 'VT-104 Low-reservoir alarm volume >= 45 dB(A)', links: ['R3'] },
  { ref: 'T5', role: 'test', state: 'done', summary: 'VT-105 Dose events written to audit log', links: ['R4'] },
  { ref: 'T6', role: 'test', state: 'inprogress', summary: 'VT-106 BLE pairing rejects legacy pairing modes', links: ['R6'] },
  { ref: 'T7', role: 'test', state: 'done', summary: 'VT-107 Basal resumes after power loss', links: ['R7'] },
  { ref: 'T8', role: 'test', state: 'done', summary: 'Exploratory test: settings menu navigation', links: [] },

  // ---- Implementation (stories) ----------------------------------------------
  { ref: 'S1', role: 'implementation', state: 'done', fixVersion: 'v2.1', summary: 'Occlusion detector driver + motor cut-off', links: ['R1'] },
  { ref: 'S2', role: 'implementation', state: 'done', fixVersion: 'v2.1', summary: 'Dose limit guard in bolus calculator', links: ['R2'] },
  { ref: 'S3', role: 'implementation', state: 'done', fixVersion: 'v2.1', summary: 'Reservoir level alarm service', links: ['R3'] },
  { ref: 'S4', role: 'implementation', state: 'inprogress', fixVersion: 'v2.1', summary: 'Battery widget on home screen', links: ['R5'] },
  { ref: 'S5', role: 'implementation', state: 'inprogress', fixVersion: 'v2.2', summary: 'BLE LE Secure Connections pairing module', links: ['R6'] },
  { ref: 'S6', role: 'implementation', state: 'done', fixVersion: 'v2.2', summary: 'Tamper-evident dose event log', links: ['R4'] },
];

/** Labels to put on a demo item, given the active label config. */
export function demoLabels(item, labels) {
  const out = ['tracewell-demo'];
  if (item.role === 'requirement') out.push(labels.requirement);
  if (item.role === 'hazard') out.push(labels.hazard);
  if (item.role === 'test') out.push(labels.test);
  if (item.safety) out.push(labels.safety);
  if (item.failed) out.push(labels.failed);
  return out;
}

/** Turn the demo spec into normalized issues (used by tests and the offline preview). */
export function demoAsIssues(labels, { verifiedAt = '2026-11-01T10:00:00Z', editedAt = '2026-11-05T09:00:00Z' } = {}) {
  const keyOf = (ref) => `PUMP-${DEMO_ITEMS.findIndex((i) => i.ref === ref) + 1}`;
  const issues = DEMO_ITEMS.map((item) => ({
    key: keyOf(item.ref),
    id: String(10000 + DEMO_ITEMS.indexOf(item)),
    summary: item.editAfterVerify ? item.editedSummary : item.summary,
    type: item.role === 'implementation' ? 'Story' : 'Task',
    status: item.state === 'done' ? 'Done' : item.state === 'inprogress' ? 'In Progress' : 'To Do',
    statusCategory: item.state === 'done' ? 'done' : item.state === 'inprogress' ? 'indeterminate' : 'new',
    labels: demoLabels(item, labels),
    priority: item.priority || 'Medium',
    assignee: null,
    created: '2026-10-20T09:00:00Z',
    updated: item.editAfterVerify ? editedAt : verifiedAt,
    resolved: item.state === 'done' ? verifiedAt : null,
    lastContentChange: item.editAfterVerify ? editedAt : '2026-10-20T09:00:00Z',
    fixVersions: item.fixVersion ? [item.fixVersion] : [],
    links: (item.links || []).map((ref) => ({ key: keyOf(ref) })),
  }));
  return issues;
}
