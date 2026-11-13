# Tracewell: audit-ready at every commit

**Live traceability and audit readiness for regulated software teams, built on Atlassian Forge.**
Codegeist 2026 entry · Category: **Apps for Specialized Industries** · Bonus prizes: **Rovo Agents**, **Atlassian MCP**, **Teamwork Graph**

---

## The problem
Teams building medical-device, automotive or financial software must prove, for every release, that:

- every requirement is verified by a passing test,
- every hazard has a risk control, and that control is verified, and
- nothing changed after it was verified.

Today that proof is a **traceability matrix built by hand in spreadsheets**, usually in the weeks before an audit. It is out of date the moment it is finished. Late changes slip through: a requirement is edited after its test passed, and nobody re-runs the test. Notified bodies and FDA inspectors find exactly these gaps, and regulated teams expect to lose weeks of audit preparation to them every release.

## The solution
Tracewell reads what teams **already have in Jira** (requirements, hazards, tests, stories and the links between them) and turns it into a **live trace graph**. Seven checks run continuously:

| Check | Severity | Example clause |
|---|---|---|
| Requirement has verification | critical if safety-relevant, otherwise major | IEC 62304 §5.7 |
| Verification tests pass | critical / major | IEC 62304 §5.7.4 |
| Verification is current (**suspect-link detection**) | major | IEC 62304 §7.4 |
| Requirement is implemented | minor | IEC 62304 §5.5 |
| Hazard has a risk control | critical | ISO 14971 §7.1 |
| Risk control is verified | critical / major | IEC 62304 §7.3 |
| Test traces to a requirement (orphan tests) | minor | IEC 62304 §5.7.1 |

**Framework packs** relabel the same checks for **IEC 62304 / ISO 14971** (MedTech), **ISO 26262** (Automotive) and **SOC 2 / ISO 27001** (Fintech/SaaS).

### Where it shows up
| Surface | What it does |
|---|---|
| **Jira project page** | Audit-readiness score and verdict (READY / AT RISK / BLOCKED), KPI cards, charts, daily trend, traceability matrix, gap list with clause and corrective action, risk-control table, settings |
| **Release gate** | Choose a fixVersion to answer "can we ship v2.1?" with evidence |
| **Jira issue panel** | Upstream and downstream trace for any issue, its gaps, *"if this changes"* impact analysis, and linked PRs and deployments from **Teamwork Graph** |
| **Audit dossier → Confluence** | One click writes a review-ready page: summary, matrix, risk controls, gaps, sign-off table |
| **Confluence macro** | Live readiness badge for a project or release, embedded in any page (design reviews, release notes) |
| **Rovo agent "Tracewell Auditor"** | Answers auditor questions in natural language with live evidence |
| **MCP server (`rovo:mcp`)** | The same four tools for Claude, Cursor or VS Code, plus a [SKILL.md](skills/tracewell/SKILL.md) for third-party agents |
| **Scheduled trigger** | Daily snapshot that builds the readiness trend line |
| **One-click demo** | Loads *PumpOS*, a fictional insulin pump with 26 linked issues that cover every kind of gap |

## Architecture
```
Jira issues + links + changelog ─┐
Teamwork Graph (PRs, deploys) ───┼─► service.js ─► engine.js (pure, unit-tested)
KVS (config, snapshots) ─────────┘        │
                                          ├─► UI Kit: project page · issue panel · Confluence macro
                                          ├─► Rovo agent actions (4) ─┐
                                          ├─► rovo:mcp tools (same 4) ┘ external AI clients
                                          ├─► Confluence dossier export
                                          └─► scheduledTrigger (daily snapshot)
```
- **`src/lib/engine.js`** contains the trace graph, checks, scoring, release gate, impact analysis and trace view. Pure JS with no Forge imports, covered by 13 unit tests that use the same PumpOS dataset the demo seeds, plus 13 end-to-end tests that run the real resolvers, seeder, Rovo actions and dossier export against in-memory fakes of Jira, Confluence, Teamwork Graph and KVS.
- **Security.** Every read runs `asUser()`, so people only see what Jira lets them see. An external MCP call that cannot act as the user falls back to `asApp()` **only after** an explicit `BROWSE_PROJECTS` permission check for that account. Read-only `GET` actions, no egress, and least-privilege scopes.
- **Suspect links** use the bulk changelog API (`summary`/`description` changes only), so a status change or a new link never raises a false alarm.
- **Teamwork Graph** uses the curated queries `jiraWorkItemLinkedExternalPullRequests` and `jiraWorkItemLinkedExternalDeployments`. It checks `errors` even on HTTP 200, uses `<company>_<operation>` names, and degrades gracefully while the API is in Preview.

## Run it
See **[docs/DEPLOY.md](docs/DEPLOY.md)**. In short:
```bash
npm install -g @forge/cli && forge login
npm install && npm run verify      # 31 tests, bundling, UI Kit prop types, manifest, lint
forge register && forge deploy
forge install --product jira && forge install --product confluence
```
Then open any Jira project → **Apps → Tracewell → Load PumpOS demo project**.

## Repository
```
manifest.yml              Forge modules, scopes, Rovo agent, MCP server, scheduler
prompts/auditor.md        Rovo agent instructions
skills/tracewell/SKILL.md Skill for third-party agents using the MCP server
src/index.js              UI resolvers + scheduled snapshot
src/agent.js              Rovo actions / MCP tools
src/lib/engine.js         Compliance engine (pure)
src/lib/frameworks.js     IEC 62304, ISO 26262, SOC 2 packs
src/lib/demoData.js       PumpOS dataset (seeded and tested)
src/lib/{jira,twg,confluence,seed,storage,service}.js
src/frontend/*.jsx        UI Kit: project page, issue panel, macro
test/                     Engine unit tests + end-to-end tests with Forge API fakes
scripts/                  Offline verification (bundle, prop types, manifest, lint)
```

*Tracewell measures traceability readiness. It does not certify compliance; the manufacturer's QA/RA function makes the final regulatory judgement.*
