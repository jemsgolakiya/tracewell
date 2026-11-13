import React, { useEffect, useState, useCallback } from 'react';
import ForgeReconciler, {
  Box, Inline, Stack, Text, Heading, Lozenge, Button, Select, Tabs, TabList, Tab, TabPanel,
  DynamicTable, SectionMessage, Spinner, DonutChart, LineChart, BarChart, ProgressBar, EmptyState,
  Textfield, Label, Link, xcss,
} from '@forge/react';
import {
  VERDICT_APPEARANCE, ROW_APPEARANCE, SEVERITY_APPEARANCE, RESULT_APPEARANCE,
  IssueLink, KeyList, Kpi, cardStyle, pct, call, half, FixButton,
} from './shared';


const pad = xcss({ paddingBlock: 'space.200' });

const SEED_STEPS = [
  { step: 'create', label: 'Creating 26 requirements, hazards, tests and stories' },
  { step: 'link', label: 'Linking the trace graph' },
  { step: 'transition', label: 'Moving work through the workflow' },
  { step: 'transition-tests', label: 'Recording verification results' },
  { step: 'edit', label: 'Changing a requirement after it was verified' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Overview
function Overview({ data, onTab, onFixed }) {
  const { report, trend, fixVersion } = data;
  const m = report.metrics;
  const top = report.gaps.slice(0, 5);
  const verdictText = {
    READY: { appearance: 'success', title: `${fixVersion ? `Release ${fixVersion}` : 'This project'} is audit-ready`, body: 'No critical or major gaps. Generate the audit dossier to share evidence with QA/RA.' },
    'AT RISK': { appearance: 'warning', title: `${fixVersion ? `Release ${fixVersion}` : 'This project'} is at risk`, body: `${report.counts.major} major gap(s) would be raised as findings in an audit.` },
    BLOCKED: { appearance: 'error', title: `${fixVersion ? `Release ${fixVersion}` : 'This project'} is blocked`, body: `${report.counts.critical} critical gap(s) affect patient or product safety. Do not release until they are closed.` },
    'NO DATA': { appearance: 'information', title: 'Nothing to trace yet', body: 'Label issues as requirements, hazards and tests, or load the demo project.' },
  }[report.verdict];

  const donut = Object.entries(report.verdictCounts).filter(([, v]) => v > 0).map(([k, v]) => ({ type: k, label: k, value: v }));
  const trendData = (trend || []).map((s) => ({ date: s.date.slice(5), value: s.score, series: 'Readiness' }));
  const bySeverity = ['critical', 'major', 'minor'].map((s) => ({ severity: s, count: report.counts[s], kind: s }));

  return (
    <Stack space="space.300">
      <SectionMessage appearance={verdictText.appearance} title={verdictText.title}>
        <Text>{verdictText.body}</Text>
      </SectionMessage>
      <Inline space="space.200" shouldWrap>
        <Kpi label="Audit readiness" value={report.score === null ? '–' : `${report.score}/100`} lozenge={report.verdict} appearance={VERDICT_APPEARANCE[report.verdict]} hint={`${report.checksRun} checks · ${report.framework.shortName}`} />
        <Kpi label="Critical gaps" value={String(report.counts.critical)} hint={`${report.counts.major} major · ${report.counts.minor} minor`} />
        <Kpi label="Verification coverage" value={pct(m.verificationCoverage)} hint={`${m.requirementsVerified}/${m.requirements} requirements fully verified`} />
        <Kpi label="Suspect verifications" value={String(m.suspectLinks)} hint="Requirement changed after its test passed" />
      </Inline>
      <Inline space="space.200" shouldWrap>
        <Box xcss={half}><Box xcss={cardStyle}>
          {donut.length ? (
            <DonutChart data={donut} colorAccessor="type" labelAccessor="label" valueAccessor="value" title="Requirement status" subtitle="Verified vs. open" height={300} showBorder={false} hideMenu
              colorPalette={[{ key: 'Verified', value: '#22A06B' }, { key: 'In verification', value: '#1D7AFC' }, { key: 'Suspect', value: '#E2B203' }, { key: 'Failing', value: '#E34935' }, { key: 'Unverified', value: '#AE2E24' }]} />
          ) : <Text>No requirements in scope.</Text>}
        </Box></Box>
        <Box xcss={half}><Box xcss={cardStyle}>
          {trendData.length >= 2 ? (
            <LineChart data={trendData} xAccessor="date" yAccessor="value" colorAccessor="series" title="Readiness trend" subtitle="Daily snapshot" height={300} showBorder={false} hideMenu />
          ) : (
            <BarChart data={bySeverity} xAccessor="severity" yAccessor="count" colorAccessor="kind" title="Open gaps by severity" subtitle="The trend appears after the second daily snapshot" height={300} showBorder={false} hideMenu
              colorPalette={[{ key: 'critical', value: '#E34935' }, { key: 'major', value: '#E2B203' }, { key: 'minor', value: '#8590A2' }]} />
          )}
        </Box></Box>
      </Inline>
      <Box xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center">
            <Heading size="small">Fix these first</Heading>
            {report.gaps.length > 5 ? <Button appearance="subtle" onClick={() => onTab(2)}>{`See all ${report.gaps.length} gaps`}</Button> : null}
          </Inline>
          {top.length ? top.map((g) => (
            <Inline key={g.id} space="space.150" alignBlock="start">
              <Lozenge appearance={SEVERITY_APPEARANCE[g.severity]} isBold>{g.severity}</Lozenge>
              <IssueLink issueKey={g.key} />
              <Stack space="space.025">
                <Text weight="semibold">{g.title}</Text>
                <Text size="small" color="color.text.subtle">{`${g.detail} → ${g.fix}`}</Text>
                <Text size="small" color="color.text.subtlest">{g.clause}</Text>
                <Box><FixButton gap={g} onDone={onFixed} /></Box>
              </Stack>
            </Inline>
          )) : <Text>No open gaps. 🎉</Text>}
        </Stack>
      </Box>
      {!data.changelogOk ? (
        <SectionMessage appearance="warning" title="Suspect-link detection is off">
          <Text>Tracewell could not read issue history, so changes made after verification are not flagged.</Text>
        </SectionMessage>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------- Matrix
function Matrix({ report }) {
  const t = report.framework.terms;
  const head = { cells: [
    { key: 'key', content: t.requirement, width: 17 },
    { key: 'summary', content: 'Summary', width: 26 },
    { key: 'hazards', content: `${t.hazard}s`, width: 11 },
    { key: 'impl', content: 'Implementation', width: 12 },
    { key: 'tests', content: 'Verification', width: 21 },
    { key: 'verdict', content: 'Status', width: 13 },
  ] };
  const rows = report.matrix.map((r) => ({
    key: r.key,
    cells: [
      { key: r.key, content: <Inline space="space.050" alignBlock="center"><IssueLink issueKey={r.key} />{r.safety ? <Lozenge appearance="new">safety</Lozenge> : null}</Inline> },
      { key: r.summary, content: <Text>{r.summary}</Text> },
      { key: r.hazards.join(), content: <KeyList keys={r.hazards} /> },
      { key: r.implementation.length, content: <KeyList keys={r.implementation.map((i) => i.key)} /> },
      { key: r.tests.length, content: r.tests.length ? (
        <Inline space="space.050" shouldWrap>
          {r.tests.map((x) => (
            <Inline key={x.key} space="space.025" alignBlock="center">
              <IssueLink issueKey={x.key} />
              <Lozenge appearance={RESULT_APPEARANCE[x.suspect ? 'suspect' : x.result]}>{x.suspect ? 'suspect' : x.result}</Lozenge>
            </Inline>
          ))}
        </Inline>
      ) : <Lozenge appearance="removed">no tests</Lozenge> },
      { key: r.verdict, content: <Lozenge appearance={ROW_APPEARANCE[r.verdict]} isBold>{r.verdict}</Lozenge> },
    ],
  }));
  return <DynamicTable caption={`Traceability matrix · ${report.matrix.length} ${t.requirement.toLowerCase()}s`} head={head} rows={rows} rowsPerPage={15} emptyView={<Text>No requirements found. Label issues with the requirement label from Settings.</Text>} />;
}

// ---------------------------------------------------------------- Gaps
function Gaps({ report, onFixed }) {
  const [sev, setSev] = useState(null);
  const gaps = report.gaps.filter((g) => !sev || g.severity === sev.value);
  const head = { cells: [
    { key: 'sev', content: 'Severity', width: 9 },
    { key: 'item', content: 'Item', width: 11 },
    { key: 'finding', content: 'Finding', width: 28 },
    { key: 'clause', content: 'Clause', width: 16 },
    { key: 'fix', content: 'Corrective action', width: 22 },
    { key: 'owner', content: 'Owner', width: 14 },
  ] };
  const order = { critical: 0, major: 1, minor: 2 };
  const rows = gaps.map((g) => ({
    key: g.id,
    cells: [
      { key: order[g.severity], content: <Lozenge appearance={SEVERITY_APPEARANCE[g.severity]} isBold>{g.severity}</Lozenge> },
      { key: g.key, content: <IssueLink issueKey={g.key} /> },
      { key: g.title, content: <Stack space="space.025"><Text weight="semibold">{g.title}</Text><Text size="small">{g.summary}</Text><Text size="small" color="color.text.subtle">{g.detail}</Text></Stack> },
      { key: g.clause, content: <Text size="small">{g.clause}</Text> },
      { key: g.fix, content: <Stack space="space.075"><Text size="small">{g.fix}</Text><Box><FixButton gap={g} onDone={onFixed} /></Box></Stack> },
      { key: g.assignee?.displayName || 'zz', content: <Text size="small">{g.assignee?.displayName || 'Unassigned'}</Text> },
    ],
  }));
  return (
    <Stack space="space.200">
      <Inline space="space.200" alignBlock="center">
        <Box xcss={xcss({ width: '220px' })}>
          <Select placeholder="All severities" isClearable value={sev} onChange={setSev}
            options={[{ label: 'Critical', value: 'critical' }, { label: 'Major', value: 'major' }, { label: 'Minor', value: 'minor' }]} />
        </Box>
        <Text color="color.text.subtle">{`${gaps.length} open gap(s). Each one maps to the clause an auditor would cite. Fix buttons create the missing Jira work, linked into the trace.`}</Text>
      </Inline>
      <DynamicTable head={head} rows={rows} rowsPerPage={15} emptyView={<Text>No gaps. Nice work.</Text>} />
    </Stack>
  );
}

// ---------------------------------------------------------------- Risk controls
function RiskControls({ report }) {
  const t = report.framework.terms;
  const head = { cells: [
    { key: 'key', content: t.hazard, width: 15 },
    { key: 'summary', content: 'Summary', width: 41 },
    { key: 'prio', content: 'Severity', width: 12 },
    { key: 'controls', content: 'Risk controls', width: 16 },
    { key: 'verified', content: 'Verified', width: 16 },
  ] };
  const rows = report.hazards.map((h) => ({
    key: h.key,
    cells: [
      { key: h.key, content: <IssueLink issueKey={h.key} /> },
      { key: h.summary, content: <Text>{h.summary}</Text> },
      { key: h.priority || '', content: <Text>{h.priority || '–'}</Text> },
      { key: h.controls.join(), content: <KeyList keys={h.controls} /> },
      { key: String(h.verified), content: !h.controls.length ? <Lozenge appearance="removed" isBold>no control</Lozenge> : <Lozenge appearance={h.verified ? 'success' : 'removed'} isBold>{h.verified ? 'verified' : 'not verified'}</Lozenge> },
    ],
  }));
  return <DynamicTable caption={`${t.hazard}s and risk controls`} head={head} rows={rows} rowsPerPage={15} emptyView={<Text>{`No ${t.hazard.toLowerCase()}s found.`}</Text>} />;
}

// ---------------------------------------------------------------- Dossier
function Dossier({ data }) {
  const [spaces, setSpaces] = useState(null);
  const [space, setSpace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    call('listSpaces').then(setSpaces).catch((e) => { setSpaces([]); setError(`Confluence is not reachable: ${e.message}. Install Tracewell in Confluence on this site to export dossiers.`); });
  }, []);

  const generate = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await call('exportDossier', { spaceId: space.value, fixVersion: data.fixVersion, projectName: data.projectName }));
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <Stack space="space.200">
      <Text>{`Writes a complete, review-ready audit dossier to Confluence: summary and verdict, traceability matrix, risk control verification, open gaps with clause references and corrective actions, and a sign-off table. Scope: ${data.fixVersion ? `release ${data.fixVersion}` : 'all items'}.`}</Text>
      <Inline space="space.200" alignBlock="end">
        <Box xcss={xcss({ width: '320px' })}>
          <Label labelFor="space">Confluence space</Label>
          <Select inputId="space" isLoading={spaces === null} placeholder="Choose a space" value={space} onChange={setSpace}
            options={(spaces || []).map((s) => ({ label: `${s.name} (${s.key})`, value: s.id }))} />
        </Box>
        <Button appearance="primary" isDisabled={!space || busy} onClick={generate}>{busy ? 'Generating…' : 'Generate audit dossier'}</Button>
      </Inline>
      {result ? (
        <SectionMessage appearance="success" title="Dossier created">
          <Text>{result.url ? <Link href={result.url} openNewTab>{result.title}</Link> : result.title}</Text>
        </SectionMessage>
      ) : null}
      {error ? <SectionMessage appearance="warning" title="Could not export"><Text>{error}</Text></SectionMessage> : null}
    </Stack>
  );
}

// ---------------------------------------------------------------- Settings & demo
function Settings({ data, onSaved, onSeed, seeding }) {
  const [framework, setFramework] = useState(data.config.framework);
  const [labels, setLabels] = useState(data.config.labels);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fwOptions = data.frameworks.map((f) => ({ label: `${f.industry}: ${f.name}`, value: f.id }));

  const save = async () => {
    setBusy(true); setMsg(null);
    try { await call('saveConfig', { config: { framework, labels } }); setMsg({ ok: true, text: 'Saved. Recalculating…' }); onSaved(); } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const removeDemo = async () => {
    setBusy(true);
    try {
      const r = await call('removeDemo');
      setMsg({ ok: !r.remaining, text: r.remaining ? `Removed ${r.removed} demo issues; ${r.remaining} could not be deleted (check the Delete issues permission).` : `Removed ${r.removed} demo issues.` });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const field = (k, title) => (
    <Box xcss={xcss({ width: '200px' })}>
      <Label labelFor={`l-${k}`}>{title}</Label>
      <Textfield id={`l-${k}`} value={labels[k]} onChange={(e) => setLabels({ ...labels, [k]: e.target.value })} />
    </Box>
  );

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="small">Regulatory framework</Heading>
        <Box xcss={xcss({ width: '480px' })}>
          <Select value={fwOptions.find((o) => o.value === framework)} onChange={(o) => setFramework(o.value)} options={fwOptions} />
        </Box>
        <Text size="small" color="color.text.subtle">Changes the vocabulary and the clause each finding maps to. The checks stay the same.</Text>
      </Stack>
      <Stack space="space.100">
        <Heading size="small">How Tracewell reads your project</Heading>
        <Text size="small" color="color.text.subtle">Label issues with these labels (or name issue types Requirement, Hazard and Test). Link them with any Jira link type. A test is passed when it is Done, and failed when it has the failed label.</Text>
        <Inline space="space.200" shouldWrap>
          {field('requirement', 'Requirement label')}
          {field('hazard', 'Hazard label')}
          {field('test', 'Test label')}
          {field('safety', 'Safety-critical label')}
          {field('failed', 'Failed test label')}
        </Inline>
      </Stack>
      <Inline space="space.200">
        <Button appearance="primary" onClick={save} isDisabled={busy}>Save settings</Button>
      </Inline>
      <Box xcss={cardStyle}>
        <Stack space="space.100">
          <Heading size="small">Demo data</Heading>
          <Text>PumpOS is a fictional insulin pump with 26 linked items covering every kind of gap Tracewell detects.</Text>
          <Inline space="space.200">
            <Button onClick={onSeed} isDisabled={busy || seeding || data.hasDemo}>Load PumpOS demo</Button>
            <Button appearance="subtle" onClick={removeDemo} isDisabled={busy || !data.hasDemo}>Remove demo issues</Button>
          </Inline>
        </Stack>
      </Box>
      {msg ? <SectionMessage appearance={msg.ok ? 'success' : 'error'}><Text>{msg.text}</Text></SectionMessage> : null}
    </Stack>
  );
}

// ---------------------------------------------------------------- Onboarding
function Onboarding({ onSeed }) {
  return (
    <EmptyState
      header="See your audit readiness in 30 seconds"
      description="Tracewell turns Jira issues into a live trace graph: requirements → hazards → tests → code. It finds the gaps an auditor would find, before they do. Load the PumpOS insulin-pump demo, or label your own issues (see Settings)."
      primaryAction={<Button appearance="primary" onClick={onSeed}>Load PumpOS demo project</Button>}
    />
  );
}

// ---------------------------------------------------------------- App
function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixVersion, setFixVersion] = useState(null);
  const [tab, setTab] = useState(0);
  const [seed, setSeed] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async (version = fixVersion) => {
    setLoading(true); setError(null);
    try { setData(await call('getOverview', { fixVersion: version?.value })); } catch (e) { setError(e.message); }
    setLoading(false);
  }, [fixVersion]);

  useEffect(() => { load(); }, []);

  const onFixed = async (result) => {
    setFlash(result);
    if (result.ok) await load();
  };

  const runSeed = async () => {
    setSeed({ index: 0, label: SEED_STEPS[0].label });
    try {
      for (let i = 0; i < SEED_STEPS.length; i += 1) {
        setSeed({ index: i, label: SEED_STEPS[i].label });
        if (SEED_STEPS[i].step === 'edit') await sleep(2500);
        await call('seedStep', { step: SEED_STEPS[i].step });
      }
      setSeed(null);
      setFixVersion(null);
      await load(null);
      setTab(0);
    } catch (e) {
      setSeed(null);
      setError(`Demo setup stopped: ${e.message}`);
    }
  };

  if (seed) {
    return (
      <Box xcss={pad}>
        <Stack space="space.200">
          <Heading size="medium">Building the PumpOS demo</Heading>
          <ProgressBar value={(seed.index + 0.5) / SEED_STEPS.length} />
          <Text>{`${seed.index + 1}/${SEED_STEPS.length} · ${seed.label}…`}</Text>
        </Stack>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box xcss={pad}>
        {error ? <SectionMessage appearance="error" title="Tracewell could not load"><Text>{error}</Text><Button onClick={() => load()}>Try again</Button></SectionMessage> : <Spinner size="large" label="Loading" />}
      </Box>
    );
  }

  const { report } = data;
  const empty = report.metrics.requirements === 0 && report.metrics.hazards === 0 && !data.fixVersion;
  const versionOptions = data.versions.map((v) => ({ label: `${v.name}${v.released ? ' (released)' : ''}`, value: v.name }));

  return (
    <Box xcss={pad}>
      <Stack space="space.200">
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Stack space="space.050">
            <Inline space="space.100" alignBlock="center">
              <Heading size="large">Audit readiness</Heading>
              <Lozenge appearance="new">{report.framework.shortName}</Lozenge>
            </Inline>
            <Text color="color.text.subtle">{`${data.projectName} · ${data.fixVersion ? `release gate for ${data.fixVersion}` : 'all requirements'} · live from Jira`}</Text>
          </Stack>
          <Inline space="space.100" alignBlock="center">
            <Box xcss={xcss({ width: '220px' })}>
              <Select placeholder="Release gate: all items" isClearable value={fixVersion} options={versionOptions}
                onChange={(v) => { setFixVersion(v); load(v); }} />
            </Box>
            <Button onClick={() => load()} isDisabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
          </Inline>
        </Inline>
        {error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : null}
        {flash ? (
          <SectionMessage appearance={flash.ok ? 'success' : 'warning'} title={flash.ok ? 'Fix applied' : 'Could not apply the fix'}>
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Text>{flash.message}</Text>
              {(flash.created || []).map((c) => <IssueLink key={c.key} issueKey={c.key} />)}
              <Button appearance="subtle" spacing="compact" onClick={() => setFlash(null)}>Dismiss</Button>
            </Inline>
          </SectionMessage>
        ) : null}
        {empty ? <Onboarding onSeed={runSeed} /> : (
          <Tabs id="tracewell-tabs" selected={tab} onChange={setTab}>
            <TabList>
              <Tab>Overview</Tab>
              <Tab>Traceability matrix</Tab>
              <Tab>{`Gaps (${report.gaps.length})`}</Tab>
              <Tab>Risk controls</Tab>
              <Tab>Audit dossier</Tab>
              <Tab>Settings</Tab>
            </TabList>
            <TabPanel><Box xcss={pad}><Overview data={data} onTab={setTab} onFixed={onFixed} /></Box></TabPanel>
            <TabPanel><Box xcss={pad}><Matrix report={report} /></Box></TabPanel>
            <TabPanel><Box xcss={pad}><Gaps report={report} onFixed={onFixed} /></Box></TabPanel>
            <TabPanel><Box xcss={pad}><RiskControls report={report} /></Box></TabPanel>
            <TabPanel><Box xcss={pad}><Dossier data={data} /></Box></TabPanel>
            <TabPanel><Box xcss={pad}><Settings data={data} onSaved={() => load()} onSeed={runSeed} seeding={!!seed} /></Box></TabPanel>
          </Tabs>
        )}
        {empty ? <Settings data={data} onSaved={() => load()} onSeed={runSeed} seeding={!!seed} /> : null}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
