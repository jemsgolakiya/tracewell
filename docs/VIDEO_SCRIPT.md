# Demo video script: 4:30 max (the rules require under 5:00)

**Goal:** a judge understands the problem in 20 seconds and sees the product working end-to-end in 4 minutes.
**Record:** 1080p, browser at 125% zoom, notifications off, PumpOS demo freshly loaded. Use a calm voice-over recorded separately (Descript, Loom or OBS). Upload to YouTube as **Public**.

| Time | On screen | Voice-over |
|---|---|---|
| **0:00–0:20** Hook | Black screen, white text: *"Show me the verification evidence for requirement SRS-114."* Then a cluttered spreadsheet traceability matrix. | "Every medical-device team hears this sentence from an auditor. Today the answer lives in a spreadsheet that took weeks to build and was out of date the day it was finished." |
| **0:20–0:40** Who / why | Title card: **Tracewell: audit-ready at every commit.** Bullets: IEC 62304 · ISO 14971 · ISO 26262 · SOC 2 | "Tracewell is a Forge app for regulated software teams. It turns the Jira issues you already have into a live trace graph and finds the gaps an auditor would find, before they do." |
| **0:40–1:05** 30-second onboarding | Empty Jira project → Apps → Tracewell → **Load PumpOS demo** → progress bar | "Here's PumpOS, a fictional insulin pump. One click creates 26 requirements, hazards, tests and stories, linked like a real design-history file." |
| **1:05–1:45** Overview | Overview tab: **BLOCKED** banner, score, KPI cards, donut. Hover "Fix these first". | "Readiness is capped at 59 and the verdict is blocked. Four critical gaps: a failing alarm test, so the low-reservoir hazard has no verified control; a hazard with no control at all; and a Bluetooth security control that's still in verification. Every finding cites the clause an auditor would use and the corrective action." |
| **1:45–2:10** Suspect link (the wow moment) | Matrix tab → PUMPOS-4 row shows **Suspect**. Open PUMPOS-4 → History shows the summary edit after the test passed. | "This is the one spreadsheets never catch. Someone changed the logging requirement *after* its test passed. The old evidence no longer proves the current requirement. Tracewell flags it from the Jira changelog automatically." |
| **2:10–2:40** Release gate + live fix | Select **v2.1** → BLOCKED. Open PUMPOS-16 (alarm test) → remove the `tw-failed` label, transition to Done → back → Refresh → **AT RISK**, score jumps. | "Can we ship 2.1? No. Let's fix the alarm, re-run the test… and refresh. The critical gaps are gone. One major gap is left: the battery display has no test. That's a ship decision made with evidence instead of gut feel." |
| **2:40–3:05** Issue panel | Open requirement PUMPOS-2 → Tracewell trace panel: hazard, story, 2 tests, *"If this item changes: re-run PUMPOS-14, PUMPOS-15; re-assess PUMPOS-9"*, Teamwork Graph evidence (PR / deployment). | "On every issue engineers see the full trace, and before they touch a safety requirement, exactly what it will cost: two tests to re-run and one hazard to re-assess. Through Teamwork Graph we extend the chain to the pull requests and deployments behind it." |
| **3:05–3:30** Rovo agent | Ask Rovo → Tracewell Auditor → "Can we ship release v2.1 of PUMP?" → answer streams in. Then "What must be re-verified if I change PUMPOS-2?" | "Auditors and QA don't want dashboards, they want answers. The Tracewell Auditor agent answers with live evidence, and every claim comes from a tool call." |
| **3:30–3:50** MCP | Claude Desktop with the Tracewell MCP connector: "Use Tracewell to list critical gaps in PUMP." | "The same tools are exposed as a Forge MCP server, so developers can ask from Claude, Cursor or VS Code, permission-checked as themselves." |
| **3:50–4:10** Audit dossier | Audit dossier tab → choose space → Generate → open the Confluence page (scroll: summary, matrix, risk controls, gaps, sign-off). Show the readiness macro on a release page. | "When it's time for the audit, one click writes the dossier to Confluence. Weeks of spreadsheet work become ten seconds, and the live macro keeps release pages honest." |
| **4:10–4:30** Close | Architecture slide (one image) → closing card: *Tracewell: audit-ready at every commit.* Forge · Jira · Confluence · Rovo · MCP · Teamwork Graph | "Built entirely on Forge: UI Kit, Rovo agent, MCP, Teamwork Graph, Confluence and a scheduled trigger, all running as the user, read-only, with no data leaving Atlassian. Tracewell gives regulated teams the confidence to ship." |

## Recording checklist
- [ ] Fresh demo (Settings → Remove demo issues → Load PumpOS demo) on the day you record
- [ ] Before recording, make sure v2.1 has PUMPOS-16 still failing (so the live fix works on camera)
- [ ] Run the Rovo questions once before recording so you know the answers look good
- [ ] Captions on (YouTube auto-captions plus a quick manual fix)
- [ ] Thumbnail: "BLOCKED → READY" with the Tracewell logo
