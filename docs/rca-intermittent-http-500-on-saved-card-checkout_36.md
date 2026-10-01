# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced into production.
*   **Incident Detected**: Monitoring alerts triggered due to increased 500 error rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineering successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; impact estimated at ~3% of checkout attempts failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two payment requests are submitted concurrently (within a 5-second window), the system fails to recognize them as duplicate attempts. This race condition leads to a state conflict or resource exhaustion, resulting in an HTTP 500 Internal Server Error on the second request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Implement Idempotency Keys**: Ensure the payment service strictly honors idempotency keys to prevent duplicate processing of concurrent requests.
*   **Fix Concurrency Handling**: Refactor the payment submission logic to handle concurrent submits gracefully without throwing 500 errors.
*   **Add Regression Tests**: Create automated tests that simulate rapid double-submissions to verify idempotency and error handling.
*   **Enhance Monitoring**: Configure dashboard alerts to trigger immediately if the HTTP 500 rate on the checkout endpoint exceeds a defined threshold.