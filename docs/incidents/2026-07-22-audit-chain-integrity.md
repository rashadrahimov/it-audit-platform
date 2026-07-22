# Audit-chain integrity incident — 2026-07-22

Status: open, evidence preserved; no hash repair was attempted.

## Environment and observed signal

- Environment: demo/production deployment at `78.47.51.200`.
- Tenant: `demo`.
- Verification endpoint: `/audit/verify-chain`.
- Result observed on 22.07.2026: `valid=false`, `checked=278`, `reason=content-hash`.
- First reported broken event: `019f76a3-ed8d-7239-b422-2e6d36d3273f`.

The application is correctly exposing the integrity failure. Recomputing stored hashes in place
would destroy the evidence and is therefore explicitly out of scope.

## Required owner decision

Choose and record one resolution from `docs/audit-log-integrity-runbook.md`:

1. restore the affected tenant from a trusted backup/PITR point;
2. preserve the broken chain and approve a new trust epoch; or
3. if this environment is formally classified as demo/non-production, reseed the demo tenant.

Until that decision is recorded and executed, the environment must continue to show
`needsReview`; it must not be represented as having a valid audit chain.
