---
name: tracewell-compliance
description: Use when a user asks about audit readiness, traceability, verification coverage, unmitigated hazards, failing or suspect tests, release readiness, or change impact for a regulated software project (IEC 62304, ISO 14971, ISO 26262, SOC 2, ISO 27001) tracked in Jira. Requires the Tracewell MCP server.
---

# Tracewell compliance skill

Tracewell exposes four read-only MCP tools from an Atlassian Forge app. They return live traceability evidence from Jira, filtered by the signed-in user's permissions.

## Connect
Add the MCP server to your client (Claude, Cursor, VS Code, ...):

```
https://mcp.atlassian.com/forge/<tracewell-app-id>
```

A site or org admin must enable external MCP access for the Tracewell installation (Atlassian Administration → Apps → Tracewell → AI access) before the tools appear.

## Tools
| Tool | Use it for | Inputs |
|---|---|---|
| `get-audit-readiness` | "Are we audit-ready?", "Can we ship v2.1?" | `projectKey`, optional `fixVersion` |
| `list-compliance-gaps` | "What would an auditor flag?" | `projectKey`, optional `severity` (critical, major, minor), optional `fixVersion` |
| `trace-requirement` | "Show the evidence for PUMPOS-3" | `issueKey` |
| `analyze-change-impact` | "What do I need to re-verify if I change PUMPOS-2?" | `issueKey` |
| `fix-compliance-gap` | "Create the missing verification test for PUMPOS-5" (a write action, so confirm with the user first) | `issueKey`, optional `finding` |

## Workflow
1. Always call a tool before making any statement about compliance status.
2. For release questions, call `get-audit-readiness` with `fixVersion`. Report the verdict first (READY, AT RISK or BLOCKED), then the critical gaps.
3. Before editing a requirement, hazard or test in code or docs, call `analyze-change-impact` and list the tests to re-run.
4. When a gap is *suspect*, explain it: the requirement changed after its test passed, so the old evidence no longer covers the current text.
5. Quote clause names exactly as returned, and never claim certification. Tracewell measures traceability readiness, and QA/RA makes the final call.

## Example
> **User:** We're cutting release v2.1 of PUMP tomorrow. Anything blocking?
>
> **Agent:** calls `get-audit-readiness {projectKey: "PUMP", fixVersion: "v2.1"}`
>
> "**v2.1 is BLOCKED.** VT-104 (low-reservoir alarm) is failing, so hazard PUMPOS-10 has no verified risk control (IEC 62304 §7.3). Fix the alarm volume and re-run PUMPOS-16. After that, the remaining gap is PUMPOS-5, which has no verification test (major)."
