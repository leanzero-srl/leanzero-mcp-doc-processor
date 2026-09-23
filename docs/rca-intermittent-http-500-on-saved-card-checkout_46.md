# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a server error, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated at ~3% failure rate for checkout attempts; classified as revenue-affecting.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When a second payment request is received within 5 seconds of the first, the system fails to recognize it as a duplicate or concurrent request, leading to race conditions and subsequent HTTP 500 errors.

## Remediation
To resolve this issue, the following actions are required:
*   **Idempotency Enforcement**: Ensure idempotency keys are strictly honored to prevent duplicate processing.
*   **Concurrency Handling**: Implement logic to handle concurrent submit requests gracefully without returning 500 errors.
*   **Testing**: Add regression tests specifically targeting concurrent payment submissions to prevent future occurrences.
*   **Monitoring**: Configure dashboard alerts to monitor the HTTP 500 error rate during checkout, enabling faster detection of similar issues in the future.