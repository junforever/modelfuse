# Enable OpenAI Web Search Capabilities

## Goal
Mark GPT-5.6 Luna and GPT-5.6 Terra as supporting web search so the UI and OpenAI provider use the capability consistently.

## Tasks
- [x] T1 — Update the catalog contract test for Luna and Terra and observe RED.
  - Evidence: focused backend Vitest exit 1; Terra and Luna expected `true` but production returned `false`.
- [x] T2 — Set both deployment capability flags to true.
  - Evidence: catalog now advertises web search for Sol, Terra, and Luna; Gemini remains false.
- [x] T3 — Observe GREEN and run focused typecheck, lint, diff, and native review checks.
  - Evidence: focused backend Vitest passed; strict backend build passed and covered `src/**/*`; catalog inventory found only Gemini false; `git diff --check` and native reliability review passed. Backend lint was skipped because the workspace exposes no supported lint script.

## Evidence
- Branch: `fix/openai-web-search-capabilities`
- Commits: none (the user did not request commits)
