# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a 500 error, affecting ~3% of total checkout attempts and resulting in direct revenue loss.

## Timeline
*   **Event**: Release of version v2.3.
*   **Symptom Onset**: Immediate post-release; users report failed transactions during checkout.
*   **Reproduction**: Logging in, selecting a saved card, and submitting payment twice within 5 seconds triggers the error.
*   **Impact Assessment**: ~3% of all checkout attempts are failing with HTTP 500.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a second request is submitted within the 5-second window, the system fails to recognize the duplicate intent, leading to a race condition or state conflict that results in an unhandled exception (HTTP 500) rather than rejecting the duplicate or returning the original transaction status.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation in the payment service. Subsequent requests with the same key must return the original transaction result without re-processing.
2.  **Testing**: Add regression tests specifically covering concurrent submissions and race conditions to ensure idempotency holds under load.
3.  **Monitoring**: Configure a dashboard alert for the HTTP 500 rate on the checkout endpoint to enable faster detection of similar issues in the future.
4.  **Verification**: Confirm that no HTTP 500 errors occur under concurrent submit scenarios during QA.