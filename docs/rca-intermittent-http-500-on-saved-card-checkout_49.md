# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Engineers successfully reproduced the 500 error by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause
The payment processing logic introduced in v2.3 lacks proper idempotency handling for concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or handle the race condition gracefully, resulting in an HTTP 500 Internal Server Error.

## Remediation Plan
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests are honored correctly without triggering server errors.
*   **Testing**: Add regression tests specifically targeting concurrent submit scenarios to verify no 500s occur under load.
*   **Monitoring**: Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for checkout endpoints exceeds acceptable thresholds.
*   **Verification**: Confirm that the fix resolves the ~30% failure rate observed during reproduction.