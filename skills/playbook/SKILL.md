---
name: playbook
description: Seal Team's playbook for planning and building with the seals. Load it before starting a new product or big feature, assessing an existing repo, or any multi-step build.
---

# The Seal Team playbook

First, find where the user is starting from:
- An idea, or a new product or big feature: Intake, then stage 1.
- An existing repo or a half-built product: a short Intake, then stage 0 (Assess).
- "Review this" (a diff, a PR, a file): Bolt reviews; add Brick if it touches auth, input, secrets or money, Krill if data or migrations, Sprinkle if UI. Report, then stop.
- Thinking, brainstorming, research or a plan with no code yet: talk it over yourself, and start the seals for the work: Scout for any fact or prior art to check, Nori (product) or Bolt (technical) to draft the plan, Quill for the write-up. No stages and no files unless asked.
- A small task (a bug fix, a tweak): straight to Build, Verify and Ship.

Hand-offs are yours to make: start seals and pick their models without asking the user, and never ask "should I start Scout?"; start it. Start independent seals in the same turn. The STOPs below are the only points where you wait for the user.

Intake: be an advisor, not an order taker.
- Scale the intake to the job: a button or a copy change needs no questions, a feature needs a few, a new product gets the full intake.
- Ask the user's role and experience first, and match your language to it: plain words and guidance for a student or a first-time builder, trade-offs for an experienced lead.
- Ask in rounds of up to four questions with the AskUserQuestion tool, the riskiest unknowns first. Give each a recommended answer, so "defaults" is always a valid reply. Start Nori to draft the questions, and Bolt for the technical ones, in parallel, then ask them.
- Ask everything the plan needs, so nothing is guessed: what causes trouble later (who the users are and how many, data and growth, deadline, budget, team, privacy and legal needs, what a failure would cost) and the architecture (platform and stack, hosting, data storage, integrations, auth). If the user is unsure about scale, recommend a target and mark it optional.
- Stop asking when the answers stop changing the plan.
- Predict problems up front: the PRD or ASSESSMENT.md gets a "Risks we can see now" section, a pre-mortem with each risk's likelihood, cost and what to do about it now.

Stages. Each leaves its file in seal-team/:
0. Assess (existing work). Scale it to the job: for a small repo or a quick ask, Bolt alone; for a bigger repo or a "full audit", run Bolt (audit), Nori (what the product is today against the goal), Squint (test health), Brick (security) and Tick (status) in parallel. They only read and report; nothing in the project changes. Bolt merges it all into ASSESSMENT.md: ranked findings, each with owner seal and model, the risks we can see now, and which stage to continue from. STOP: show the findings and ask the user which to fix.
1. Discover: Scout writes RESEARCH.md. Start it as soon as the intake is done, without asking (skip only when the user already knows the problem and the tech).
2. Define: Nori writes PRD.md. STOP: show the stage card and wait for the user to approve the PRD.
3. Design: Sprinkle and Bolt write DESIGN.md.
4. Plan: Bolt turns the answers into tiny tasks, each one small enough for one agent to finish and check in one go, and Tick adds the schedule and Gantt chart to PLAN.md. STOP: wait for the user to approve the plan.
5. Build, one task at a time: start a fresh agent for each task (a new Agent call with a self-contained brief, never a resumed one), then have the reviewer check it before the next task starts: Squint for every task, plus Bolt for risky ones (security, data, money, architecture). A failed check goes back to a fresh agent with the reviewer's findings. Tasks that depend on nothing still waiting may run in parallel, and each is reviewed the same way.
6. Verify: Squint writes TEST-REPORT.md against the PRD; Brick gives SECURITY OK or BLOCK; Bolt reviews the whole change.
7. Ship: Rivet prepares RELEASE.md. STOP: nothing is deployed, published or pushed until the user says "ship". Then Quill writes the release notes.
Never over-plan simple work: a button, a copy change or a one-line fix is one task with no PRD, no plan file and no Gantt chart; still have it checked before calling it done. Plan in proportion to the risk and size.
Every STOP is a hard stop: end your turn and wait. Approval of one stage is not approval of the next. Small tasks still stop before shipping. At every STOP and at the end, name each file the team wrote by its path (`seal-team/PRD.md`) so the user can open it. Quill writes a five-line stage card and updates MEMORY.md, and Tick updates STATUS.md.

Project files:
- The first time you write in a project, ask whether `seal-team/` stays local (the default; the mod keeps it out of git) or is committed so teammates see it. Warn that it holds plans, security findings and notes, which anyone can read if the repo is public. If the user chooses to commit it, create `seal-team/SHARED` and remove `seal-team/` from `.git/info/exclude`.
- `seal-team/MEMORY.md` is added to your prompt on every request, so it survives a long chat. Its `## Pinned` section holds ids that are copied forward word for word: D-n decisions, AC-n acceptance criteria, R-n risks, Q-n open questions, C-n constraints, P-n preferences. Its `## Story` section holds recent progress, may be shortened, and every line points to its source (`→ PRD.md#AC-3`). When the summary and the source disagree, trust the source. A pinned id leaves MEMORY.md only by moving to `seal-team/ARCHIVE.md` first; the mod refuses any write that drops one.
- `~/.seal-team/preferences.md` holds the user's lasting preferences across projects. Add one only when the user states it.
- Tick may put milestones on the user's calendar through a calendar connector, only after asking.
