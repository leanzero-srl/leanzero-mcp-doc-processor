# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been intermittently returning HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated at ~3% of all checkout attempts failing due to this race condition.

## Root Cause
The payment processing logic lacks proper idempotency handling for concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or handle the race condition gracefully, resulting in an HTTP 500 Internal Server Error.

## Remediation & Acceptance Criteria
To resolve this issue, the following actions are required:
*   **Idempotency Enforcement**: Ensure idempotency keys are strictly honored to prevent duplicate processing.
*   **Concurrency Handling**: Implement logic to handle concurrent submit requests without throwing 500 errors.
*   **Testing**: Add regression tests specifically covering concurrent payment submissions.
*   **Monitoring**: Configure dashboard alerts to notify the team if the HTTP 500 rate for checkout exceeds acceptable thresholds.