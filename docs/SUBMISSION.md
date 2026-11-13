# Devpost submission copy (paste-ready)

**Project name:** Tracewell
**Tagline (≤ 60 chars):** Audit-ready traceability for regulated software teams
**Category:** Apps for Specialized Industries
**Bonus prizes:** Best Agents (Rovo) · Best app with Atlassian MCP · Best apps with Teamwork Graph integration · Best Marketplace published app (if the listing is submitted)
**Built with:** forge, jira, confluence, rovo, rovo-mcp, teamwork-graph, ui-kit, javascript, react, node.js

---

## Inspiration
In medical-device software, *"show me the verification evidence for this requirement"* is the most expensive sentence in the building. IEC 62304 and ISO 14971 require proof that every requirement is verified, every hazard is controlled, and every change is re-assessed. Most teams still produce that proof as a hand-built spreadsheet traceability matrix in the weeks before an audit. It is stale the day it is finished, and it misses the most dangerous gap: a requirement that changed *after* its test passed.

The data to answer all of this already lives in Jira. It just isn't connected as **context**. That is exactly the Codegeist theme: build with context, ship with confidence.

## What it does
Tracewell turns the requirements, hazards, tests and stories a team already tracks in Jira into a **live trace graph**. It continuously runs seven checks mapped to the clauses an auditor cites:

- unverified requirements, and failing verification tests
- **suspect verifications**: the requirement text changed after its test passed (detected from the Jira changelog)
- hazards with no risk control, and risk controls that aren't verified
- unimplemented requirements and orphan tests

It surfaces this as:
1. **An audit-readiness score and verdict** (READY / AT RISK / BLOCKED) on a Jira project page, with charts, a daily trend, the full traceability matrix, a prioritized gap list (clause + corrective action + owner) and a risk-control table.
2. **A release gate.** Choose a fixVersion to answer *"can we ship v2.1?"* with evidence.
3. **An issue panel** on every issue: upstream and downstream trace, gaps, *"if this item changes"* impact analysis, and PRs and deployments from **Teamwork Graph**.
4. **A one-click audit dossier** written to Confluence (summary, matrix, risk controls, gaps, sign-off table), plus a **live readiness macro** for release pages.
5. **Tracewell Auditor, a Rovo agent** that answers auditor questions with live evidence.
6. **A Forge MCP server** exposing the same four tools to Claude, Cursor or VS Code, plus a SKILL.md for third-party agents.
7. **Framework packs** for IEC 62304 / ISO 14971 (MedTech), ISO 26262 (Automotive) and SOC 2 / ISO 27001 (Fintech): same engine, auditor-specific vocabulary and clauses.

A **one-click PumpOS demo** (a fictional insulin pump, 26 linked issues) lets anyone see the full experience in 30 seconds.

## How we built it
- **Forge UI Kit** (`jira:projectPage`, `jira:issuePanel`, Confluence `macro`) with native charts, dynamic tables and Atlassian design tokens.
- **Rovo agent** (`rovo:agent`) with four `action` modules, and the **same actions exposed through `rovo:mcp`**. One implementation serves both surfaces.
- **Teamwork Graph API** curated queries (`jiraWorkItemLinkedExternalPullRequests`, `jiraWorkItemLinkedExternalDeployments`) via `asUser().requestTeamworkGraph`. This extends the trace chain from requirement → story → PR → deployment.
- **Jira REST** (`/search/jql`, bulk changelog, versions, permissions check), **Confluence REST v2** for the dossier, **Forge KVS** for settings and snapshots, and a **scheduledTrigger** for the daily readiness trend.
- A **pure, framework-agnostic compliance engine** (`engine.js`) with 31 automated tests: engine unit tests on the exact dataset the demo seeds, plus end-to-end tests that drive the real resolvers, seeder, agent actions and dossier export against fakes of the Atlassian APIs.
- **Security by design:** everything runs `asUser()`, actions are read-only `GET`, there is no external egress, and the MCP fallback to `asApp()` happens only after an explicit `BROWSE_PROJECTS` permission check for the calling account.

## Challenges we ran into
- **Avoiding false "suspect" alarms.** Jira's `updated` field changes on every comment, transition or new link. We used the bulk changelog API and only count `summary`/`description` changes.
- **Teamwork Graph Preview quirks.** HTTP 200 responses can carry errors, operation names must follow `<company>_<operation>`, and missing scopes silently drop rows. We built a defensive client with a rich-then-minimal query fallback.
- **Making the score honest.** A weighted pass rate alone gave a "78/100" to a project with an unmitigated hazard. We added readiness bands: any critical gap caps the score below 60.
- **Seeding a realistic demo inside resolver time limits.** We split it into five idempotent steps with a progress bar.

## Accomplishments that we're proud of
- A judge or a new user goes from an empty project to a full, believable compliance picture in **30 seconds**.
- One engine, **six surfaces**: project page, issue panel, Confluence dossier, Confluence macro, Rovo, MCP.
- Suspect-link detection, which spreadsheet matrices structurally can't do.

## What we learned
Context is the product. Regulated teams don't need another tool to enter data into. They need the links they already have to *answer questions*. Agents and MCP are what make that context reachable from anywhere people work.

## What's next for Tracewell
- Write-back: one-click "create missing verification test" and "re-open suspect test" actions (with approval)
- Teamwork Graph connector to publish verification records as graph objects
- Electronic signatures on the dossier (21 CFR Part 11)
- More packs: EU MDR technical documentation, DO-178C (avionics), IEC 61508
- Marketplace launch with a free tier for small MedTech startups

---

## "How it meets the technology requirement" field
Tracewell is a Forge app (UI Kit, Node 22 runtime) that integrates with **Jira** (project page, issue panel, REST: search, changelog, versions, permissions), **Confluence** (macro, REST v2 page creation), **Rovo** (`rovo:agent` with four `action` modules), **Atlassian MCP** (`rovo:mcp` exposing the same tools), and **Teamwork Graph** (curated queries for linked PRs and deployments). Storage uses Forge KVS, and a Forge `scheduledTrigger` records a daily snapshot.

## Testing instructions for judges
1. Install with the link below, in **Jira** and **Confluence** on your test site.
2. Create a company-managed Jira project (any name/key).
3. Project sidebar → **Apps → Tracewell** → **Load PumpOS demo project** (about 20 s).
4. Explore the tabs; choose **v2.1** in the release-gate dropdown.
5. Open any requirement → **Tracewell trace** panel.
6. **Audit dossier** tab → choose a space → Generate.
7. **Ask Rovo** → **Tracewell Auditor** → "Can we ship release v2.1 of <KEY>?"
8. Settings → **Remove demo issues** cleans everything up.

Installation link: `<paste from developer console → Distribution>`
Demo video: `<YouTube link>`
Source code: `<GitHub link>`
