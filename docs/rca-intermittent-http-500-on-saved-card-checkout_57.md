# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Engineers identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause
The payment processing logic lacks proper idempotency handling for concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or handle the race condition gracefully, resulting in an HTTP 500 Internal Server Error.

## Remediation Plan
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests are handled correctly without throwing 500 errors.
*   **Testing**: Add regression tests specifically targeting concurrent payment submissions to verify idempotency behavior.
*   **Monitoring**: Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for checkout endpoints exceeds acceptable thresholds.
*   **Acceptance Criteria**: 
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test coverage is added.
    *   Dashboard alerting is active.