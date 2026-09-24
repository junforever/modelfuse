# Adopt Selective Preflight Policy

## Goal
Replace blanket preflight and elevation requirements with a selective, reusable policy that preserves deterministic runtimes and integration safety without redundant checks.

## Tasks

- [x] ODD-001 Define selective runtime-profile rules in `AGENTS.md`.
- [x] ODD-002 Align the contributor-facing workflow in `README.md`.
- [x] ODD-003 Independently verify policy consistency, command examples, and preserved blocker evidence.

## Evidence

- ODD-001/ODD-002: updated the authoritative policy and contributor guidance; aligned stale diagnostics and current feature/E2E command examples under the documentation/diagnostic-only strict-TDD exception.
- ODD-003: independent verification PASS; both `-Force` diagnostics are qualified, no agent-scoped bypass guidance remains, and `git diff --check` passed with line-ending warnings only.

## Decisions

- Run no preflight for profiles unused by the current block.
- Initialize Node/pnpm only when `runtime.local.json` is missing, stale, invalid, or the runtime changed; otherwise rely on `run-pnpm.ps1` validation.
- Run the integration preflight once before the first real Docker/PostgreSQL/Liquibase-dependent command and again only after relevant state changes or external correction.
- Run the Python preflight only for Python-dependent commands.
- Use normal host permissions by default; request elevation only after a concrete permission failure.
- Prefer native PowerShell invocation of `run-pnpm.ps1`; do not wrap it with `powershell -File` when literal `--` arguments are required.
