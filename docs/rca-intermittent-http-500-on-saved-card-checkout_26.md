# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been intermittently returning HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated at ~3% of all checkout attempts failing due to this race condition.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When two requests are submitted concurrently (within a 5-second window), the system fails to recognize them as duplicate attempts, leading to a race condition that results in an HTTP 500 error on the second request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Idempotency Enforcement**: Ensure idempotency keys are strictly honored to prevent duplicate processing of the same transaction.
*   **Concurrency Handling**: Implement logic to handle concurrent submit requests gracefully, ensuring no HTTP 500s occur under load.
*   **Testing**: Add regression tests specifically targeting concurrent payment submissions to catch similar issues in the future.
*   **Monitoring**: Configure dashboard alerts to monitor HTTP 500 rates during checkout, enabling faster detection of similar anomalies.