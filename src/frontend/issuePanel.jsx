import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Inline, Stack, Text, Heading, Lozenge, SectionMessage, Spinner, Link, Button, xcss } from '@forge/react';
import { ROW_APPEARANCE, SEVERITY_APPEARANCE, RESULT_APPEARANCE, ROLE_LABEL, IssueLink, cardStyle, call } from './shared';

const section = xcss({ paddingBlockStart: 'space.100' });

function LinkGroup({ title, items, showResult = false }) {
  if (!items.length) return null;
  return (
    <Stack space="space.050">
      <Text size="small" weight="semibold" color="color.text.subtle">{title}</Text>
      {items.map((i) => (
        <Inline key={i.key} space="space.100" alignBlock="center">
          <IssueLink issueKey={i.key} />
          <Text size="small" maxLines={1}>{i.summary}</Text>
          {showResult && i.result ? <Lozenge appearance={RESULT_APPEARANCE[i.suspect ? 'suspect' : i.result]}>{i.suspect ? 'suspect' : i.result}</Lozenge> : null}
        </Inline>
      ))}
    </Stack>
  );
}

function Evidence({ evidence }) {
  if (!evidence) return null;
  const prs = evidence.items.flatMap((i) => i.pullRequests.map((p) => ({ ...p, from: i.key })));
  const deps = evidence.items.flatMap((i) => i.deployments.map((d) => ({ ...d, from: i.key })));
  return (
    <Box xcss={section}>
      <Stack space="space.050">
        <Inline space="space.100" alignBlock="center">
          <Text size="small" weight="semibold" color="color.text.subtle">Engineering evidence</Text>
          <Lozenge appearance="new">Teamwork Graph</Lozenge>
        </Inline>
        {!evidence.available ? <Text size="small" color="color.text.subtlest">{`Teamwork Graph is not available on this site yet${evidence.notes?.length ? ` (${evidence.notes[0]})` : ''}.`}</Text> : null}
        {evidence.available && !prs.length && !deps.length ? <Text size="small" color="color.text.subtlest">No linked pull requests or deployments found for the implementation items.</Text> : null}
        {prs.map((p) => (
          <Inline key={p.id} space="space.100" alignBlock="center">
            <Lozenge>PR</Lozenge>
            {p.url ? <Link href={p.url} openNewTab>{p.title}</Link> : <Text size="small">{p.title}</Text>}
            {p.state ? <Lozenge appearance="inprogress">{p.state}</Lozenge> : null}
            <Text size="small" color="color.text.subtlest">{`via ${p.from}`}</Text>
          </Inline>
        ))}
        {deps.map((d) => (
          <Inline key={d.id} space="space.100" alignBlock="center">
            <Lozenge appearance="success">Deploy</Lozenge>
            {d.url ? <Link href={d.url} openNewTab>{d.title}</Link> : <Text size="small">{d.title}</Text>}
            {d.environment ? <Text size="small">{d.environment}</Text> : null}
          </Inline>
        ))}
      </Stack>
    </Box>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setData(null); setError(null);
    call('getTrace').then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <SectionMessage appearance="error" title="Tracewell"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Tracing" />;
  if (data.notTraced) {
    return <Text color="color.text.subtle">Not part of the trace graph. Add a Tracewell label (requirement, hazard or test) or link this issue to one.</Text>;
  }
  const { trace: t, impact } = data;
  const fw = t.framework;
  const roleName = { requirement: fw.terms.requirement, hazard: fw.terms.hazard, test: fw.terms.test, implementation: fw.terms.implementation }[t.role] || ROLE_LABEL[t.role];

  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Lozenge appearance="new" isBold>{roleName}</Lozenge>
        {t.safety ? <Lozenge appearance="removed">{fw.terms.safety}</Lozenge> : null}
        {t.verdict ? <Lozenge appearance={ROW_APPEARANCE[t.verdict]} isBold>{t.verdict}</Lozenge> : null}
        {t.role === 'test' && t.result ? <Lozenge appearance={RESULT_APPEARANCE[t.result]}>{t.result}</Lozenge> : null}
        <Button appearance="subtle" spacing="compact" onClick={load}>Refresh</Button>
      </Inline>

      {t.gaps.length ? (
        <Stack space="space.100">
          {t.gaps.map((g) => (
            <SectionMessage key={g.id} appearance={g.severity === 'critical' ? 'error' : g.severity === 'major' ? 'warning' : 'information'} title={g.title}>
              <Text size="small">{g.detail}</Text>
              <Text size="small">{`Fix: ${g.fix}`}</Text>
              <Inline space="space.100"><Lozenge appearance={SEVERITY_APPEARANCE[g.severity]}>{g.severity}</Lozenge><Text size="small" color="color.text.subtlest">{g.clause}</Text></Inline>
            </SectionMessage>
          ))}
        </Stack>
      ) : <SectionMessage appearance="success"><Text size="small">No compliance gaps on this item.</Text></SectionMessage>}

      <Box xcss={cardStyle}>
        <Stack space="space.150">
          <LinkGroup title={`${fw.terms.hazard}s`} items={t.links.hazards} />
          <LinkGroup title={`${fw.terms.requirement}s`} items={t.links.requirements} />
          <LinkGroup title="Implementation" items={t.links.implementation} />
          <LinkGroup title="Verification" items={t.links.tests} showResult />
          <Evidence evidence={data.evidence} />
        </Stack>
      </Box>

      {impact ? (
        <Box xcss={cardStyle}>
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center">
              <Heading size="xsmall">If this item changes</Heading>
              <Lozenge appearance={impact.riskLevel === 'high' ? 'removed' : impact.riskLevel === 'medium' ? 'moved' : 'default'}>{`${impact.riskLevel} impact`}</Lozenge>
            </Inline>
            {impact.actions.map((a) => <Text key={a} size="small">{`• ${a}`}</Text>)}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
