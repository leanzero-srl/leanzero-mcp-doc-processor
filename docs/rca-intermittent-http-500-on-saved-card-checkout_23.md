# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. Approximately 30% of rapid duplicate submissions result in a failure, impacting ~3% of total checkout attempts. This issue is revenue-affecting and requires immediate remediation to ensure transaction reliability.

## Timeline

*   **Release v2.3 Deployed:** Introduction of the regression.
*   **Incident Detected:** Users report failed payments when submitting checkout quickly.
*   **Reproduction Confirmed:** Internal testing verifies that submitting payment twice within a 5-second window triggers the 500 error in ~30% of cases.
*   **Impact Assessment:** Estimated 3% failure rate on checkout attempts.

## Root Cause

The root cause is a lack of proper idempotency handling for concurrent payment submissions. When a user submits the payment request twice within a short timeframe (under 5 seconds), the system fails to recognize the second request as a duplicate, leading to a race condition that results in an HTTP 500 error.

## Remediation

To resolve this issue, the following actions are required:

1.  **Implement Idempotency Keys:** Ensure the backend honors idempotency keys for payment requests. Subsequent requests with the same key should return the result of the original request rather than processing a new transaction.
2.  **Fix Race Condition:** Update the payment processing logic to handle concurrent submissions gracefully, preventing HTTP 500 errors.
3.  **Add Regression Tests:** Develop automated test cases that simulate rapid duplicate submissions to ensure the fix holds under load.
4.  **Monitoring & Alerts:** Configure a dashboard alert to monitor the HTTP 500 rate for checkout endpoints, enabling faster detection of similar issues in the future.

**Acceptance Criteria:**
*   Idempotency key is honored.
*   No HTTP 500 errors occur under concurrent submit conditions.
*   Regression test coverage is added.
*   Dashboard alert is configured for 500 rate anomalies.