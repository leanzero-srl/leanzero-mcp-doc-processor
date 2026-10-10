# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced in production.
*   **Incident Detected**: Monitoring alerts triggered on increased HTTP 500 rates during checkout.
*   **Reproduction Confirmed**: Engineering reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; remediation plan defined below.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two payment requests are submitted concurrently (within a 5-second window), the system fails to recognize them as duplicate attempts. This race condition leads to a server-side error (HTTP 500) on the second request approximately 30% of the time.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Implement Idempotency Keys**: Ensure the payment service honors idempotency keys to prevent duplicate processing of concurrent requests.
*   **Fix Race Condition**: Update the payment logic to handle concurrent submissions gracefully, ensuring no HTTP 500 errors occur under load.
*   **Add Regression Tests**: Create automated tests that simulate concurrent payment submissions to verify the fix.
*   **Enhance Monitoring**: Configure dashboard alerts to notify onboarding teams immediately if the HTTP 500 rate for checkout exceeds acceptable thresholds.