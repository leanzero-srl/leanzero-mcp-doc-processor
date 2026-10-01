# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue affects approximately 3% of checkout attempts, posing a direct risk to revenue. The failure occurs specifically when a user submits payment twice within a 5-second window.

## Timeline
*   **Release v2.3 Deployed:** Service updated to new checkout logic.
*   **Issue Detected:** Monitoring alerts triggered for increased HTTP 500 rates on the payment endpoint.
*   **Reproduction:** Issue consistently reproduced by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status:** Investigation ongoing; mitigation plan defined below.

## Root Cause Analysis
*   **Trigger:** Concurrent submission of payment requests for the same saved card within a short timeframe (≤5s).
*   **Mechanism:** The second payment submission fails to properly handle the race condition, resulting in an unhandled exception that propagates as a 500 Internal Server Error.
*   **Frequency:** Occurs in approximately 30% of double-submission attempts, translating to ~3% of total checkout volume.
*   **Missing Guardrails:** Lack of strict idempotency enforcement for concurrent requests in the new v2.3 logic.

## Remediation Plan
*   **Immediate Fix:** Enforce idempotency keys to ensure duplicate requests within the window are ignored or handled gracefully without throwing 500 errors.
*   **Testing:** Add regression tests specifically targeting concurrent payment submissions to prevent recurrence.
*   **Monitoring:** Configure dashboard alerts to notify the team immediately if HTTP 500 rates on checkout endpoints spike above baseline.
*   **Acceptance Criteria:**
    *   Idempotency key is honored.
    *   No HTTP 500 errors occur under concurrent submit scenarios.
    *   Regression test coverage added.
    *   Dashboard alert configured for 500 rate anomalies.