// Regulatory "framework packs". Each pack renames the trace roles and maps every
// Tracewell check to the clause an auditor would cite. The engine is framework
// agnostic: packs only change vocabulary, clause references and guidance.

export const FRAMEWORKS = {
  iec62304: {
    id: 'iec62304',
    name: 'Medical device software (IEC 62304 + ISO 14971)',
    shortName: 'IEC 62304',
    industry: 'MedTech',
    terms: {
      requirement: 'Software requirement',
      hazard: 'Hazard',
      test: 'Verification test',
      implementation: 'Implementation item',
      safety: 'Safety class C',
    },
    clauses: {
      REQ_VERIFIED: 'IEC 62304 §5.7 Software system testing',
      REQ_TEST_PASS: 'IEC 62304 §5.7.4 Evaluate software system testing',
      REQ_TEST_CURRENT: 'IEC 62304 §7.4 Risk management of software changes',
      REQ_IMPLEMENTED: 'IEC 62304 §5.5 Software unit implementation',
      HAZ_MITIGATED: 'ISO 14971 §7.1 Risk control option analysis',
      HAZ_CONTROL_VERIFIED: 'IEC 62304 §7.3 Verification of risk control measures',
      TEST_TRACED: 'IEC 62304 §5.7.1 Establish tests for software requirements',
    },
  },
  iso26262: {
    id: 'iso26262',
    name: 'Automotive functional safety (ISO 26262)',
    shortName: 'ISO 26262',
    industry: 'Automotive',
    terms: {
      requirement: 'Safety requirement',
      hazard: 'Hazardous event',
      test: 'Verification test',
      implementation: 'Implementation item',
      safety: 'ASIL C/D',
    },
    clauses: {
      REQ_VERIFIED: 'ISO 26262-6 §11 Testing of the embedded software',
      REQ_TEST_PASS: 'ISO 26262-6 §11.4 Verification results',
      REQ_TEST_CURRENT: 'ISO 26262-8 §8 Change management',
      REQ_IMPLEMENTED: 'ISO 26262-6 §8 Software unit design and implementation',
      HAZ_MITIGATED: 'ISO 26262-3 §6 Hazard analysis and risk assessment',
      HAZ_CONTROL_VERIFIED: 'ISO 26262-8 §9 Verification',
      TEST_TRACED: 'ISO 26262-8 §6.4.3 Traceability of safety requirements',
    },
  },
  soc2: {
    id: 'soc2',
    name: 'Fintech & SaaS controls (SOC 2 + ISO 27001)',
    shortName: 'SOC 2',
    industry: 'Finance',
    terms: {
      requirement: 'Control requirement',
      hazard: 'Risk',
      test: 'Control test',
      implementation: 'Implementation item',
      safety: 'Key control',
    },
    clauses: {
      REQ_VERIFIED: 'SOC 2 CC4.1 Monitoring of controls',
      REQ_TEST_PASS: 'SOC 2 CC4.2 Evaluation of control deficiencies',
      REQ_TEST_CURRENT: 'SOC 2 CC8.1 Change management',
      REQ_IMPLEMENTED: 'ISO 27001 A.8.25 Secure development life cycle',
      HAZ_MITIGATED: 'SOC 2 CC3.2 Risk identification and analysis',
      HAZ_CONTROL_VERIFIED: 'SOC 2 CC5.1 Selection of control activities',
      TEST_TRACED: 'ISO 27001 A.8.29 Security testing in development',
    },
  },
};

export const DEFAULT_CONFIG = {
  framework: 'iec62304',
  labels: {
    requirement: 'tw-req',
    hazard: 'tw-hazard',
    test: 'tw-test',
    safety: 'tw-safety',
    failed: 'tw-failed',
  },
};

export function getFramework(id) {
  return FRAMEWORKS[id] || FRAMEWORKS[DEFAULT_CONFIG.framework];
}

export function normalizeConfig(cfg) {
  const c = cfg || {};
  return {
    framework: FRAMEWORKS[c.framework] ? c.framework : DEFAULT_CONFIG.framework,
    labels: { ...DEFAULT_CONFIG.labels, ...(c.labels || {}) },
  };
}
