# Deploy Tracewell (about 20 minutes)

You only do this once. Run every command in a terminal on your own computer.

## 0. Prerequisites
```bash
node --version          # must be 20 or later (22 recommended)
npm install -g @forge/cli
forge --version
```

## 1. Log in to Forge
1. Open https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token** → name it `codegeist26` → copy it.
2. Run:
```bash
forge login
```
Enter your Atlassian email and paste the token. (Type it yourself; never share it with anyone, including AI assistants.)

## 2. Get the free Codegeist development site (Jira + Confluence + Rovo)
```bash
forge site provision
```
Wait until it prints your site URL (`https://<something>.atlassian.net`). Open it and check that Jira, Confluence (`/wiki`) and Rovo Chat load.

## 3. Register and deploy the app
```bash
cd tracewell
npm install
npm run verify          # 26 tests + bundle + UI Kit prop types + manifest + lint, all offline
forge register          # name it "Tracewell"; this writes YOUR app id into manifest.yml
forge lint              # full lint, including the scope checks that need a login
forge deploy
```

## 4. Install on your site (both products)
```bash
forge install --demo-site            # choose Jira when asked
forge install --demo-site            # run it again and choose Confluence
```
(If `--demo-site` is not offered, use `forge install --product jira --site <your-site>.atlassian.net`, then the same with `--product confluence`.)

Accept the scopes when prompted.

## 5. Try it
1. In Jira, create a **company-managed** Scrum or Kanban project, e.g. **PumpOS** with key **PUMP**.
2. In the project sidebar, open **Apps → Tracewell** and click **Load PumpOS demo project**. It takes about 20 seconds and creates 26 linked issues and versions v2.1 and v2.2.
3. Explore: **Overview**, **Traceability matrix**, **Gaps**, **Risk controls**, and **Release gate** (pick v2.1 in the dropdown).
4. Open any issue, e.g. the low-reservoir alarm requirement, and expand the **Tracewell trace** panel.
5. **Audit dossier** tab → choose a Confluence space → **Generate audit dossier**.
6. In Confluence, insert the **Tracewell readiness** macro on any page and enter `PUMP`.
7. **Rovo**: click **Ask Rovo** → choose **Tracewell Auditor** → "Can we ship release v2.1 of PUMP?"

## 6. MCP (for the "Best app with Atlassian MCP" bonus)
1. Your app id is the UUID at the end of `app.id` in `manifest.yml`.
2. An org admin enables external AI access for Tracewell: **admin.atlassian.com → Apps → Sites → (your site) → Connected apps → Tracewell → AI access / MCP**, and turns on the four tools.
3. In Claude (Settings → Connectors → Add custom connector), Cursor or VS Code, add `https://mcp.atlassian.com/forge/<your-app-id>` and sign in.
4. Ask: *"Use Tracewell: is project PUMP audit-ready? What must I re-verify if I change PUMP-2?"*
5. Optionally add `skills/tracewell/SKILL.md` to your agent's skills.

## 7. Share with judges (required for the submission)
```bash
forge deploy -e production
forge install -e production --product jira --site <your-site>.atlassian.net
forge install -e production --product confluence --site <your-site>.atlassian.net
```
Then open **developer.atlassian.com/console → Tracewell → Distribution**, set **Sharing** to on, fill in the details, and copy the **installation link**. Put that link plus this test guide in the Devpost "Testing instructions" field.

## 8. Marketplace bonus (optional, +$1,500)
Developer console → **Tracewell → Distribution → List on Marketplace** (free listing). Submit, then paste the listing link or the review ticket link into Devpost.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `forge install` asks to upgrade after a scope change | `forge install --upgrade` (repeat for Confluence) |
| Dossier says "Confluence is not reachable" | Install the app in Confluence too (step 4) |
| Evidence shows "Teamwork Graph is not available" | Expected on sites without connected dev tools; the rest of the app works. Link a Bitbucket or GitHub PR to a story to see evidence |
| "Suspect-link detection is off" | Your site blocked the bulk changelog API; everything else still works |
| Demo creation fails on priority | Tracewell retries without priority automatically; use a company-managed project for the best result |
| Logs | `forge logs -e development --since 15m` |
