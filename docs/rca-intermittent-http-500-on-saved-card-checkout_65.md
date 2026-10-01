# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Engineers successfully reproduced the error by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: Data indicates ~30% failure rate on rapid double-submissions, affecting ~3% of all checkout attempts.

## Root Cause
The payment processing logic introduced in v2.3 lacks proper idempotency handling for concurrent or near-simultaneous requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or race condition, leading to a server-side error (HTTP 500) instead of honoring the idempotency key or returning a success/failure status gracefully.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests within the window are handled correctly without throwing 500 errors.
*   **Testing**: Add regression tests specifically targeting concurrent submit scenarios to ensure no 500s occur under load.
*   **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during checkout processes.
*   **Acceptance Criteria**: Verify that idempotency keys are honored and no 500s occur under concurrent submit conditions.