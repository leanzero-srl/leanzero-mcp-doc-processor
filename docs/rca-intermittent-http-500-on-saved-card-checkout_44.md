# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. These errors occur when a user submits a payment twice within a short timeframe (5 seconds). The issue impacts approximately 3% of checkout attempts, resulting in revenue loss and a degraded user experience.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detection**: Monitoring alerts triggered due to increased HTTP 500 rates on the checkout endpoint.
*   **Reproduction**: Engineers successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds. The second request failed with a 500 error ~30% of the time.
*   **Impact Assessment**: Estimated 3% failure rate on checkout attempts.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two requests are submitted concurrently (within a 5-second window), the system fails to honor the idempotency key, leading to race conditions that result in HTTP 500 internal server errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Ensure the payment service strictly honors the idempotency key for concurrent submissions.
2.  **Testing**: Add regression tests that simulate concurrent payment submissions to verify no HTTP 500s occur.
3.  **Monitoring**: Implement a dashboard alert to notify the team immediately if the HTTP 500 rate on the checkout endpoint exceeds the baseline threshold.
4.  **Verification**: Confirm that the fix resolves the ~30% failure rate observed during the reproduction scenario.