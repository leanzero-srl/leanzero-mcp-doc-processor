# RCA for intermittent HTTP 502 in import/export

## Summary
Multiple customers reported intermittent failures in the import/export flow over the last 36 hours. The issue manifests as an HTTP 502 error returned by `payments-svc`, affecting approximately 6% of requests. The incident was triggered by the rollout of version 2.3.0 and is correlated with a session-refresh race condition.

## Timeline
*   **T-36h**: `payments-svc` v2.3.0 rolled out to production.
*   **T-36h to T-0**: On-call engineer observes spike in 5xx alerts; customer support tickets begin to arrive.
*   **T-0**: Incident confirmed; investigation begins.
*   **Current**: Root cause identified as a race condition in the new pipeline.

## Root Cause
The root cause is a **session-refresh race condition** introduced in the v2.3.0 pipeline. 

*   **Mechanism**: The new pipeline began reading the session object before the refresh middleware completed under load.
*   **Evidence**: The error stack trace shows `TypeError: Cannot read properties of undefined (reading 'token')` at `validateSession`. This indicates the `token` property was null/undefined due to the race.
*   **Reproducibility**: The issue is intermittent and harder to reproduce with fresh sessions, which explains why it slipped past QA. It primarily affects users with cached credentials/saved payment methods.

## Remediation
### Immediate Actions
*   **Fix**: Serialize the session refresh logic to prevent the race condition, consistent with mitigations applied in prior related incidents.
*   **Deployment**: Implement a roll-forward fix behind the existing feature flag (`import/export-new-pipeline`).
*   **Rollback Plan**: Ensure a tested rollback procedure is available if the fix does not resolve the issue.

### Verification & Acceptance Criteria
*   **Soak Test**: No HTTP 502 errors from `payments-svc` for the import/export flow over a 24-hour soak period at 2x peak load.
*   **Testing**: Document the root cause and add a regression test that fails on the current build and passes on the fixed build.
*   **Monitoring**: Monitor support volume and 5xx error rates closely post-deployment.

### Additional Notes
*   Please attach HAR captures and correlation IDs to this ticket for further analysis.
*   Severity: High (material impact on revenue and trust).