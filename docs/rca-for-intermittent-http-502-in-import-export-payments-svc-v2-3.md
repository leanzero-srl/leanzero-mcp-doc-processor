# RCA for intermittent HTTP 502 in import/export (payments-svc v2.3)

## Summary
Between ~36 hours ago and now, customers intermittently experienced HTTP 502 failures in the import/export flow. The 502 is returned by `payments-svc` (v2.3.0) and is correlated with the `import/export-new-pipeline` feature flag rollout. Failures affect ~6% of requests, especially on returning users using cached credentials, and retries succeed ~60% of the time—suggesting a race condition rather than a deterministic outage.

## Timeline (UTC)
- **~36h ago:** `payments-svc` **v2.3.0** rollout begins; **feature flag `import/export-new-pipeline=ON`**.
- **T0 (~within rollout window):** Spike in **5xx** alerts observed.
- **T0 + (on-call confirmation):** On-call engineer confirms correlation with import/export pipeline changes.
- **T0 + (shortly after):** Customer support tickets begin to accumulate; reproduced for returning users with cached credentials.
- **Current:** Error localized to `TypeError` in session validation: attempting to read `token` from an undefined session.

## Evidence
- Observed stack trace:
  - `TypeError: Cannot read properties of undefined (reading 'token')`
  - at `validateSession` (`/payments-svc/src/session.js:31`)
  - called from `payments-svc.handleRequest` (`/payments-svc/src/handler.js:139`)
- Customer/QA behavior:
  - **Fresh sessions do not reproduce**
  - **Saved payment method / cached credential does reproduce**
  - Request **hangs ~8s** then fails
  - **Immediate retry succeeds ~60%**

## Root Cause
A **session-refresh race condition** was introduced in the v2.3 import/export pipeline. Under load, the new pipeline can attempt to validate the session (expecting `session.token`) **before the session-refresh middleware completes**, resulting in an undefined session object and throwing in `validateSession`. This exception propagates and manifests to clients as an intermittent HTTP 502.

## Remediation
### Immediate / Stabilization
- **Roll-forward fix behind the existing feature flag** (`import/export-new-pipeline`): ensure the new pipeline **waits for session refresh to complete** before executing `validateSession` / token-dependent logic.
- Apply the previously proven mitigation: **serialize refresh** (or otherwise enforce ordering) to prevent refresh/validation overlap.

### Safety Nets
- **Regression test:** add an automated test that simulates the refresh/validation timing under load and fails if `token` is accessed before refresh completion.
- **Soak verification:** confirm **no HTTP 502** from `payments-svc` for import/export over a **24h soak at 2x peak**.

### Rollback Plan
- If the fix fails validation, **roll back behind the feature flag** (disable `import/export-new-pipeline`) using the existing flag control, after verifying via canary/correlation IDs.

## Action Items
- [ ] Implement ordering/await or synchronization between session refresh middleware and session validation in v2.3 pipeline.
- [ ] Add regression test covering returning users with cached credentials and refresh timing.
- [ ] Run 24h soak at 2x peak and monitor 5xx and correlation IDs.
- [ ] Prepare/verify feature-flag rollback steps.

## Attachments Needed
- HAR captures and **correlation IDs** for affected requests (as requested in the ticket) to confirm race timing and validate the remediation.