# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and affecting revenue.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced in production.
*   **Incident Detected**: Monitoring alerts triggered due to increased 500 error rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineering team successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; remediation steps defined below.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two requests are submitted concurrently (within a 5-second window), the system fails to recognize them as duplicate attempts for the same transaction. This race condition leads to a state inconsistency or resource conflict, resulting in an HTTP 500 Internal Server Error on the second request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Implement Idempotency Keys**: Ensure the payment service honors idempotency keys to correctly identify and reject duplicate requests within a specified time window.
2.  **Fix Concurrency Handling**: Update the backend logic to handle concurrent submissions gracefully without throwing 500 errors.
3.  **Add Regression Tests**: Create automated tests that simulate concurrent payment submissions to verify the fix.
4.  **Enhance Monitoring**: Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for checkout attempts exceeds a defined threshold.

**Acceptance Criteria:**
*   Idempotency keys are honored by the payment service.
*   No HTTP 500 errors occur under concurrent submit conditions.
*   Regression test coverage is added for this scenario.
*   Dashboard alerts are active for checkout 500 error rates.