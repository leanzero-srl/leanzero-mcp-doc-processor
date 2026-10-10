# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause
The payment processing logic lacks proper idempotency handling for concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or race condition, leading to a server-side error (HTTP 500) instead of honoring the idempotency key or returning a success/failure status gracefully.

## Remediation Plan
1.  **Code Fix**: Implement strict idempotency key validation to ensure concurrent submissions are handled correctly without throwing 500 errors.
2.  **Testing**: Add regression tests specifically targeting concurrent payment submissions to prevent recurrence.
3.  **Monitoring**: Configure dashboard alerts to trigger when the HTTP 500 rate for checkout endpoints exceeds acceptable thresholds.
4.  **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions in staging before production release.