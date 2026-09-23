# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout functionality has been intermittently returning HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a failure, affecting ~3% of total checkout attempts. This is a revenue-impacting issue requiring immediate remediation.

## Timeline
*   **Release v2.3 Deployed**: Issue begins to manifest.
*   **Reproduction Identified**: Confirmed that submitting payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause
The root cause is identified as a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When concurrent or near-concurrent requests are submitted (specifically within a 5-second window), the system fails to honor the idempotency key, leading to race conditions and subsequent HTTP 500 errors.

## Remediation
To resolve this issue, the following actions are required:

*   **Code Fix**: Ensure the idempotency key is strictly honored to prevent duplicate processing.
*   **Stability**: Guarantee no HTTP 500 errors occur under concurrent submit scenarios.
*   **Testing**: Add a regression test specifically targeting concurrent payment submissions.
*   **Monitoring**: Implement a dashboard alert to monitor HTTP 500 rates during checkout, enabling faster detection of future incidents.