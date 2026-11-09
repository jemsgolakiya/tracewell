import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Inline, Stack, Text, Heading, Lozenge, SectionMessage, Spinner, Textfield, Label, useConfig, xcss } from '@forge/react';
import { VERDICT_APPEARANCE, SEVERITY_APPEARANCE, IssueLink, cardStyle, call } from './shared';

const Config = () => (
  <>
    <Label labelFor="projectKey">Jira project key</Label>
    <Textfield name="projectKey" placeholder="e.g. PUMP" />
    <Label labelFor="fixVersion">Release (optional)</Label>
    <Textfield name="fixVersion" placeholder="e.g. v2.1" />
  </>
);

function App() {
  const config = useConfig();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null); setError(null);
    call('getMacroReadiness', { projectKey: config?.projectKey, fixVersion: config?.fixVersion })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [config?.projectKey, config?.fixVersion]);

  if (error) return <SectionMessage appearance="warning" title="Tracewell readiness"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Loading readiness" />;
  if (data.needsConfig) return <SectionMessage appearance="information" title="Tracewell readiness"><Text>Edit this macro and enter a Jira project key.</Text></SectionMessage>;

  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150">
        <Inline space="space.150" alignBlock="center" shouldWrap>
          <Heading size="medium">{`${data.projectKey}${data.fixVersion ? ` ${data.fixVersion}` : ''}: ${data.score ?? '–'}/100`}</Heading>
          <Lozenge appearance={VERDICT_APPEARANCE[data.verdict]} isBold>{data.verdict}</Lozenge>
          <Lozenge appearance="new">{data.framework.shortName}</Lozenge>
        </Inline>
        <Text color="color.text.subtle">{`${data.counts.critical} critical · ${data.counts.major} major · ${data.counts.minor} minor gaps · ${data.metrics.verificationCoverage ?? '–'}% verification coverage · live from Jira`}</Text>
        {data.topGaps.map((g) => (
          <Inline key={g.id} space="space.100" alignBlock="center">
            <Lozenge appearance={SEVERITY_APPEARANCE[g.severity]}>{g.severity}</Lozenge>
            <IssueLink issueKey={g.key} />
            <Text size="small">{g.title}</Text>
          </Inline>
        ))}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
ForgeReconciler.addConfig(<Config />);
