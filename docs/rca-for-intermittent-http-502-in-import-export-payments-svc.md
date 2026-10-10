# RCA for intermittent HTTP 502 in import/export (payments-svc)

## Summary
Over the last ~36 hours, customers intermittently experienced HTTP 502 failures in the **import/export** flow. The error originates in **payments-svc** and is correlated with the **v2.3.0** rollout. Approximately **6%** of affected-flow requests fail. The failures show a `TypeError` in session validation: **“Cannot read properties of undefined (reading 'token')”**, consistent with a **session-refresh race** introduced by the new import/export pipeline.

## Timeline
- **~36h ago:** `payments-svc` **v2.3.0** rolled out.
- **~past 36h:** Multiple customers report intermittent import/export failures (HTTP 502 from payments-svc).
- **T0 (initial detection):** On-call notices spike in **5xx** alerts; validated with customer support tickets.
- **During investigation:** Correlation observed with feature flag **`import/export-new-pipeline = ON`**.
- **Reproduction:** On Firefox 125 (Ubuntu 22.04), returning-user flow using saved payment method/cached credentials hangs ~8s then fails; immediate retry succeeds ~60% of the time.
- **Root-cause evidence:** Stack trace points to `validateSession` accessing a missing session `token`, likely due to refresh timing.

## Root Cause
The v2.3 import/export flow (guarded by `import/export-new-pipeline`) introduced an execution-order/timing issue where **the new pipeline reads session data before the session-refresh middleware completes** under load. In that race window, `validateSession` receives an **undefined/partially initialized session**, causing a `TypeError` when attempting to read `token`. payments-svc then returns **HTTP 502**, producing intermittent failures that are masked by successful retries after refresh completes.

## Remediation
- **Immediate mitigation (rollback/guarded deploy):**
  - Roll back/disable the new pipeline via existing feature flag: `import/export-new-pipeline`.
  - Alternatively, deploy a roll-forward fix behind the same flag with verified behavior under load.
- **Code-level fix:**
  - Restore correct ordering by ensuring **session refresh completes before session validation** (e.g., await refresh middleware; serialize refresh as was done in prior related incidents).
  - Add defensive handling so session validation fails safely (clear error) rather than crashing on missing `token`.
- **Regression coverage:**
  - Add a regression test that simulates the refresh timing/race condition so it **fails on the current build** and passes with the fix.
- **Verification/soak:**
  - Meet acceptance criteria: **no HTTP 502 from payments-svc** for the import/export flow over a **24h soak at 2x peak**.
- **Operational follow-ups:**
  - Collect/attach **HAR captures** and **correlation IDs** for affected sessions to confirm the race is eliminated and to support monitoring dashboards.

## Additional notes / hypotheses disposition
- Connection pool exhaustion and stale CDN bundle were considered, but the observed `TypeError` in `validateSession` strongly supports the **session-refresh race** explanation.