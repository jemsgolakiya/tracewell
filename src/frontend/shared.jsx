import React, { useState } from 'react';
import { Box, Inline, Stack, Text, Lozenge, Link, Heading, Button, xcss } from '@forge/react';
import { invoke } from '@forge/bridge';

export const VERDICT_APPEARANCE = { READY: 'success', 'AT RISK': 'moved', BLOCKED: 'removed', 'NO DATA': 'default' };
export const ROW_APPEARANCE = { Verified: 'success', 'In verification': 'inprogress', Suspect: 'moved', Failing: 'removed', Unverified: 'removed' };
export const SEVERITY_APPEARANCE = { critical: 'removed', major: 'moved', minor: 'default' };
export const RESULT_APPEARANCE = { passed: 'success', failed: 'removed', pending: 'inprogress', suspect: 'moved' };
export const ROLE_LABEL = { requirement: 'Requirement', hazard: 'Hazard', test: 'Test', implementation: 'Implementation' };

export const cardStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface.raised',
});

export const IssueLink = ({ issueKey }) => <Link href={`/browse/${issueKey}`}>{issueKey}</Link>;

export function KeyList({ keys }) {
  if (!keys || !keys.length) return <Text color="color.text.subtlest">none</Text>;
  return (
    <Inline space="space.050" shouldWrap>
      {keys.map((k) => <IssueLink key={k} issueKey={k} />)}
    </Inline>
  );
}

const kpiStyle = xcss({ flexGrow: 1, minWidth: '200px' });

/** @param {{ label: string, value: string, hint?: string | null, lozenge?: string | null, appearance?: any }} props */
export function Kpi({ label, value, hint = null, lozenge = null, appearance = 'default' }) {
  return (
    <Box xcss={kpiStyle}><Box xcss={cardStyle}>
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">{label}</Text>
        <Inline space="space.100" alignBlock="center">
          <Heading size="large">{value}</Heading>
          {lozenge ? <Lozenge appearance={appearance} isBold>{lozenge}</Lozenge> : null}
        </Inline>
        {hint ? <Text size="small" color="color.text.subtlest">{hint}</Text> : null}
      </Stack>
    </Box></Box>
  );
}

export const pct = (v) => (v === null || v === undefined ? '–' : `${v}%`);

/** invoke() wrapper: resolvers always return { ok, data | error }. */
export async function call(fn, payload = undefined) {
  const res = /** @type {any} */ (await invoke(fn, payload));
  if (!res || !res.ok) throw new Error((res && res.error) || 'Request failed');
  return res.data;
}

export const half = xcss({ flexGrow: 1, width: '48%', minWidth: '320px' });

/**
 * One-click fix for a gap. Calls the applyRemedy resolver (runs as the user) and reports back.
 * @param {{ gap: any, onDone: (result: { ok: boolean, message: string, created?: any[] }) => void, appearance?: any }} props
 */
export function FixButton({ gap, onDone, appearance = 'default' }) {
  const [busy, setBusy] = useState(false);
  if (!gap.remedy) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await call('applyRemedy', { gapId: gap.id });
      onDone({ ok: r.applied || r.alreadyResolved, message: r.message, created: r.created });
    } catch (e) {
      onDone({ ok: false, message: e.message });
    }
    setBusy(false);
  };
  return <Button appearance={appearance} spacing="compact" iconBefore="add" isDisabled={busy} onClick={run}>{busy ? 'Working…' : gap.remedy.label}</Button>;
}
