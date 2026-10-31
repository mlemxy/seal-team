# Seal Team

A Claude Code mod (a plugin of function hooks) plus 12 seal agents and a three.js island page.

## Before pushing

- Never push or publish without the owner's explicit yes.
- `claude plugin validate .` and `claude plugin test .` both pass.
- If you changed `island/index.html`, open it once (it falls back to demo mode with no `live.js`) and check the browser console is clean.

## Rules

- Nothing on the team runs above Claude Opus 5.5 at effort `high`. Pin each agent's `model:` to an exact id (`claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`) and keep `effort:` at `high` or below. Keep `isOverCap` in `hooks/register.tsx` in step with any new model tiers.
- Mochi's brief lives in `hooks/brief.ts`: the starting paths, intake, stages 0 to 7 and the hard stops (after Assess, the PRD and the plan, and before shipping). Keep the brief, the README and the tests that check the stops in step.
- Project files go in `.seal-team/`; the mod keeps it out of git unless `.seal-team/SHARED` exists.
- Each seal's file sets its default model; Mochi moves a seal up or down for one task through the Agent tool's `model` parameter.
- The seal ids in `hooks/register.tsx` (`TEAM`), `island/index.html` (`TEAM`) and the id list in `hooks/register.test.ts` must match the agent file names in `agents/`.
- The shared "House rules for every seal" block is the same in every agent file. Change it everywhere at once.
- No personal data in this repo: no names, emails, private URLs, session ids or real project names. Demo content is made up.
