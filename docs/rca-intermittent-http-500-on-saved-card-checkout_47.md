# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced in production.
*   **Incident Detected**: Monitoring alerts triggered due to increased HTTP 500 rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineering team successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; remediation plan defined below.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two requests are submitted concurrently (within a 5-second window), the system fails to recognize them as duplicate attempts for the same transaction. This race condition leads to a state inconsistency or resource conflict, resulting in an HTTP 500 Internal Server Error on the second request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Implement Idempotency Keys**: Ensure the payment service strictly honors idempotency keys. Duplicate requests with the same key should return the result of the original request rather than processing a new transaction.
2.  **Fix Race Condition**: Update the backend logic to handle concurrent submissions safely, ensuring no HTTP 500 errors occur under load.
3.  **Add Regression Tests**: Create automated tests that simulate concurrent payment submissions to verify the fix.
4.  **Enhance Monitoring**: Configure dashboard alerts to notify the team immediately if the HTTP 500 rate on the checkout endpoint exceeds a defined threshold.

**Acceptance Criteria:**
*   Idempotency key is honored for all payment requests.
*   No HTTP 500 errors occur during concurrent submit attempts.
*   Regression test coverage added for this scenario.
*   Dashboard alert configured for checkout 500 rate.