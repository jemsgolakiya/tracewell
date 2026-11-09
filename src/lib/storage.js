import { kvs } from '@forge/kvs';
import { normalizeConfig } from './frameworks.js';

const MAX_SNAPSHOTS = 90;
const safeKey = (k) => String(k || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

export async function getConfig(projectKey) {
  return normalizeConfig(await kvs.get(`config:${safeKey(projectKey)}`));
}

export async function saveConfig(projectKey, config) {
  const clean = normalizeConfig(config);
  for (const [k, v] of Object.entries(clean.labels)) {
    clean.labels[k] = String(v).trim().replace(/\s+/g, '-').slice(0, 40) || normalizeConfig().labels[k];
  }
  await kvs.set(`config:${safeKey(projectKey)}`, clean);
  return clean;
}

export async function trackProject(projectKey) {
  const list = (await kvs.get('tracked-projects')) || [];
  if (!list.includes(projectKey)) {
    list.push(projectKey);
    await kvs.set('tracked-projects', list.slice(-50));
  }
}

export async function getTrackedProjects() {
  return (await kvs.get('tracked-projects')) || [];
}

/** One snapshot per project per day; the latest run of the day wins. */
export async function recordSnapshot(projectKey, report) {
  if (report.score === null) return getSnapshots(projectKey);
  const key = `snapshots:${safeKey(projectKey)}`;
  const list = (await kvs.get(key)) || [];
  const date = new Date().toISOString().slice(0, 10);
  const entry = {
    date,
    score: report.score,
    critical: report.counts.critical,
    major: report.counts.major,
    minor: report.counts.minor,
  };
  const idx = list.findIndex((s) => s.date === date);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  const trimmed = list.slice(-MAX_SNAPSHOTS);
  await kvs.set(key, trimmed);
  return trimmed;
}

export async function getSnapshots(projectKey) {
  return (await kvs.get(`snapshots:${safeKey(projectKey)}`)) || [];
}

export async function getSeedState(projectKey) {
  return (await kvs.get(`seed:${safeKey(projectKey)}`)) || null;
}

export async function setSeedState(projectKey, state) {
  if (state === null) return kvs.delete(`seed:${safeKey(projectKey)}`);
  return kvs.set(`seed:${safeKey(projectKey)}`, state);
}
