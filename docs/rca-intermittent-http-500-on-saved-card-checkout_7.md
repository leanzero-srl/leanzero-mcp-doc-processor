# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has exhibited intermittent HTTP 500 errors. The issue is triggered by rapid successive payment submissions (within 5 seconds) using a saved card. This results in approximately 3% of checkout attempts failing, directly impacting revenue.

## Timeline

*   **Release v2.3 Deployed:** Introduction of the regression.
*   **Incident Detected:** Users report failed transactions when submitting payments twice in quick succession.
*   **Reproduction Confirmed:** Engineering verified that the second call within a 5-second window fails ~30% of the time.
*   **Current Status:** Active investigation; impact estimated at 3% of total checkout attempts.

## Root Cause

The root cause is identified as a **race condition in the payment processing logic** introduced in v2.3. The system fails to properly handle concurrent requests for the same saved card, leading to a state conflict that triggers an unhandled exception (HTTP 500) on the second rapid submission.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix:** Implement strict idempotency key validation to ensure concurrent submissions are treated as a single transaction.
*   **Testing:** Add a regression test specifically targeting concurrent submit scenarios to ensure no 500 errors occur under load.
*   **Monitoring:** Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for the checkout endpoint exceeds the baseline threshold.

**Acceptance Criteria:**
- Idempotency keys are honored.
- No HTTP 500s occur under concurrent submit conditions.
- Regression test coverage is added.
- Dashboard alerting is active.