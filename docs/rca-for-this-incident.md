# RCA for this incident

## Summary

An intermittent HTTP 502 error was observed in the import/export flow within the `payments-svc` service following the rollout of version 2.3.0. Approximately 6% of requests affected by this flow failed, primarily impacting returning users on Firefox 125 (Ubuntu 22.04) using saved payment methods. The issue was triggered by a session-refresh race condition introduced in the new pipeline, where the service attempted to read session data before the refresh middleware completed under load.

## Timeline

*   **T-36 hours**: Version 2.3.0 of `payments-svc` was rolled out.
*   **T-36h to T-0**: On-call engineer detected a spike in 5xx alerts correlated with the new release.
*   **T-0**: Issue confirmed via customer support tickets reporting intermittent failures.
*   **Current**: Investigation ongoing; estimated 6% failure rate in the affected flow.

## Root Cause

The primary root cause is a **session-refresh race condition** in the v2.3 pipeline.

*   **Mechanism**: The new import/export pipeline began reading the session object before the session refresh middleware had completed its execution under load.
*   **Error Manifestation**: This race condition resulted in a `null` token, causing a `TypeError: Cannot read properties of undefined (reading 'token')` at `validateSession` (`/payments-svc/src/session.js:31`).
*   **Why it slipped QA**: Retrying the request immediately succeeded ~60% of the time, masking the intermittent nature of the bug during standard testing.
*   **Affected Scope**: Primarily impacting returning users with cached credentials/saved payment methods. Fresh sessions did not reproduce the issue.

## Remediation

### Immediate Actions
1.  **Roll-forward Fix**: Implement a fix behind the existing `import/export-new-pipeline` feature flag.
2.  **Rollback Plan**: Ensure the fix includes a tested rollback mechanism to revert to the previous stable behavior if issues persist.
3.  **Mitigation Strategy**: Apply serialization to the session refresh process, consistent with resolutions of prior related incidents.

### Verification & Acceptance Criteria
*   **Soak Test**: Validate that no HTTP 502 errors occur in the `payments-svc` import/export flow over a 24-hour soak period at 2x peak load.
*   **Regression Test**: Document the root cause and implement a regression test that fails on the current build to prevent recurrence.
*   **Data Collection**: Attach HAR captures and correlation IDs to this ticket for further analysis.

### Affected Environment Details
| Attribute | Value |
| :--- | :--- |
| **Service** | payments-svc |
| **Version** | 2.3.0 |
| **Region** | eu-west-1 |
| **Feature Flag** | import/export-new-pipeline = ON |
| **Browser/OS** | Firefox 125 (Ubuntu 22.04) |
| **Error Type** | HTTP 502 (Internal Server Error) |
| **Stack Trace** | `TypeError: Cannot read properties of undefined (reading 'token')` at `validateSession` |

### Hypotheses Considered (Ruled Out)
*   Connection-pool exhaustion in `payments-svc` under burst load.
*   Stale CDN cache serving a mismatched client bundle.