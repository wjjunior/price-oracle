# Price Oracle

A confidence-aware multi-source price feed for Bitcoin and Ethereum, with operator-facing controls and observability.

> The full README lands with PRO-40 (project documentation). This file currently captures only the contributor-facing CI and branch-protection guidance introduced with PRO-11.

## Branch protection

Configure `main` under **Settings → Branches → Branch protection rules** with:

**Required status checks (must pass before merge):**

- `verify (typecheck)`
- `verify (lint)`
- `verify (test)`
- `actionlint`

**Additional rules:**

- _Require branches to be up to date before merging_ — keeps main close to linear without forcing aggressive rebases.
- _Require a pull request before merging_ with at least one approving review.
- _Restrict pushes that create matching branches_ — no direct pushes to `main`.

The workflow that produces these checks lives at `.github/workflows/verify.yml`.
