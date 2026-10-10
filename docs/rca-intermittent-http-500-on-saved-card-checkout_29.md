# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a server error, impacting roughly 3% of total checkout attempts and affecting revenue.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Engineers identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When a second payment request is received within 5 seconds of the first, the system fails to recognize it as a duplicate or concurrent attempt, leading to race conditions that result in HTTP 500 errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Idempotency Enforcement**: Ensure idempotency keys are strictly honored to prevent duplicate processing.
*   **Concurrency Handling**: Implement robust locking or queueing mechanisms to ensure no HTTP 500s occur under concurrent submit scenarios.
*   **Testing**: Add regression tests specifically targeting rapid double-submission and concurrency edge cases.
*   **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during checkout processes.

**Acceptance Criteria:**
*   Idempotency key is honored.
*   No HTTP 500s occur under concurrent submit conditions.
*   Regression test added and passing.
*   Dashboard alert configured for 500 rate anomalies.