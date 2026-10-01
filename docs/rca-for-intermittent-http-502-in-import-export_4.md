# RCA for intermittent HTTP 502 in import/export

## Summary
An incident involving intermittent HTTP 502 errors in the import/export flow was identified following the rollout of `payments-svc` v2.3.0. Approximately 6% of requests using saved payment methods failed, primarily affecting returning users on Firefox 125 (Ubuntu 22.04). The issue was triggered by a session-refresh race condition introduced in the new pipeline, which caused `undefined` token errors under load.

## Timeline
*   **T-36h**: `payments-svc` v2.3.0 rolled out to production with the `import/export-new-pipeline` feature flag enabled.
*   **T-0**: On-call engineer detects a spike in 5xx alerts correlating with the rollout.
*   **T+1h**: Customer support tickets begin arriving; issue confirmed as intermittent 502 errors during import/export submissions.
*   **T+4h**: Root cause identified as a session-refresh race condition in the new pipeline.
*   **T+6h**: Hotfix deployed behind feature flag; monitoring confirms error rate reduction.

## Root Cause Analysis
The root cause is a **session-refresh race condition** introduced in the v2.3 pipeline.

*   **Mechanism**: The new import/export pipeline began reading the session object before the session-refresh middleware had completed its execution under load.
*   **Symptom**: This race condition resulted in the `token` property being `undefined`, leading to a `TypeError: Cannot read properties of undefined (reading 'token')` in `validateSession` (`/payments-svc/src/session.js:31`).
*   **Why it slipped QA**: The issue is load-dependent and intermittent. Retrying the request immediately succeeds ~60% of the time because the race condition does not trigger on every request, allowing it to pass standard QA checks.
*   **Affected Scope**: Primarily impacting returning users with cached credentials/saved payment methods on Firefox 125 (Ubuntu 22.04) in the `eu-west-1` region.

## Remediation & Next Steps
### Immediate Actions
*   **Roll-forward Fix**: Deployed a fix behind the existing `import/export-new-pipeline` feature flag. The fix serializes the session refresh to prevent concurrent reads before completion.
*   **Rollback Plan**: The feature flag allows for immediate rollback to the previous stable pipeline if issues persist.

### Long-term Improvements
*   **Regression Testing**: Implement a regression test that specifically fails on the current build if the session-refresh race condition is reintroduced.
*   **Soak Testing**: Validate the fix with a 24-hour soak test at 2x peak load to ensure no HTTP 502 errors occur in the import/export flow.
*   **Monitoring**: Enhance alerting to detect `TypeError` patterns in session validation logs earlier.

### Acceptance Criteria Status
*   [ ] No HTTP 502 from `payments-svc` for the import/export flow over a 24h soak at 2x peak.
*   [ ] Root cause documented with a regression test that fails on the current build.
*   [ ] Roll-forward fix behind the existing feature flag with a tested rollback.

**Notes**: HAR captures and correlation IDs have been attached to this ticket for further analysis.