# RCA for intermittent HTTP 502 in import/export

## Summary
An incident involving intermittent HTTP 502 errors occurred within the `payments-svc` service during the import/export flow. The issue affected approximately 6% of requests, specifically impacting returning users with cached credentials on Firefox/Ubuntu. The root cause was identified as a session-refresh race condition introduced in version 2.3.0.

## Timeline
*   **T-36 Hours**: Version 2.3.0 rolled out to `payments-svc` in eu-west-1.
*   **T-0 (Approx)**: On-call engineer detects spike in 5xx alerts.
*   **T+1 Hour**: Incident confirmed via customer support tickets; correlation with v2.3 rollout established.
*   **Current**: Investigation ongoing; impact assessed as High due to revenue and trust implications.

## Root Cause
The root cause is a **session-refresh race condition** introduced in the new pipeline of version 2.3.0.

Under load, the new pipeline began reading the session object before the refresh middleware had completed its operation. This resulted in the `token` property being undefined when accessed by `validateSession`, leading to a `TypeError: Cannot read properties of undefined (reading 'token')`. This error propagated up as an HTTP 502 Bad Gateway.

**Evidence:**
*   Stack trace shows failure at `/payments-svc/src/session.js:31` inside `validateSession`.
*   Error occurs specifically when using saved payment methods/cached credentials (fresh sessions do not reproduce).
*   Retrying immediately succeeds ~60% of the time, as the race condition is timing-dependent and load-sensitive.

## Remediation
### Immediate Actions
1.  **Roll-forward Fix**: Implement a fix behind the existing feature flag (`import/export-new-pipeline = ON`) that serializes the session refresh process to prevent reading before completion.
2.  **Validation**: Ensure the fix is tested against the acceptance criteria (no HTTP 502s over a 24h soak at 2x peak load).

### Long-term Actions
1.  **Regression Testing**: Add a regression test that fails on the current build to prevent recurrence of this specific race condition.
2.  **Monitoring**: Enhance alerting for `TypeError` patterns in session validation to catch similar issues earlier.
3.  **Documentation**: Attach HAR captures and correlation IDs to this ticket for future reference.