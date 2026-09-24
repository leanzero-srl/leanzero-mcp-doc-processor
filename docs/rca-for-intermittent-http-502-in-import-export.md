# RCA for intermittent HTTP 502 in import/export

## Summary
Multiple customers experienced intermittent HTTP 502 failures in the import/export flow over the last ~36 hours. The 502 originates from **payments-svc** and correlates with the **v2.3.0** rollout. Failures occur ~**6%** of requests in the affected flow and are more likely when users use **saved payment methods / cached credentials**, suggesting a **session handling race** rather than a general outage.

## Timeline
- **36h ago:** **payments-svc v2.3.0 (2.3.0)** rolled out.
- **Last ~36h:** Import/export intermittent failures begin; spike in 5xx alerts observed.
- **On-call:** Detected increased 5xx rate and confirmed via customer support tickets.
- **During investigation:** Reproduction found on **Firefox 125 / Ubuntu 22.04** using **returning user** with cached credentials; fresh sessions do not reproduce.
- **Error observed:** Request hangs ~8s then fails; immediate retry succeeds ~60% of the time.

## Root Cause
**Session-refresh race introduced by the v2.3 import/export pipeline.**

The stack trace shows `TypeError: Cannot read properties of undefined (reading 'token')` in `validateSession` (`payments-svc/src/session.js:31`). This indicates the session is being read **before the refresh middleware completes** under load. When the import/export-new-pipeline runs (feature flag **ON**), it can attempt to validate a session whose `token` is temporarily undefined, causing the handler to error and the client to receive an **HTTP 502**.

## Remediation
1. **Code fix (v2.3):** Ensure session refresh completion before session validation in the new pipeline (e.g., enforce correct middleware ordering or add synchronization so `validateSession` cannot run until `refresh` has populated the token).
2. **Regression test:** Add an automated test that reproduces the race condition (returning user / cached credential + load conditions) and fails on the current build; verify it passes with the fix.
3. **Feature-flagged roll-forward / rollback plan:**
   - Roll forward the fix behind **import/export-new-pipeline**.
   - If errors persist, **rollback** behind the same feature flag using the existing mitigation strategy.
4. **Operational hardening:** Add targeted logging/metrics for session-refresh timing and validation failures (include correlation IDs) and confirm **no HTTP 502** for import/export on a 24h soak at 2x peak.
5. **Artifacts to collect:** Attach **HAR captures** and **correlation IDs** for failing requests to speed validation and confirm closure.

## Follow-up / Acceptance Criteria
- **No HTTP 502** from `payments-svc` for import/export over a **24h soak at 2x peak**.
- **Regression test** added and passing on the fixed build.
- **Roll-forward fix behind** the existing feature flag with a **tested rollback** path.