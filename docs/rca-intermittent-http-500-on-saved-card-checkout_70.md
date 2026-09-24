# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Post-release v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue affects approximately 3% of checkout attempts, specifically when a user submits payment twice within a 5-second window. This has resulted in revenue loss and requires immediate remediation to ensure idempotency and system stability.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Users report intermittent payment failures.
*   **Reproduction Confirmed**: Verified that submitting a saved-card payment twice within 5 seconds triggers a 500 error ~30% of the time.
*   **Impact Assessment**: Estimated 3% of all checkout attempts are failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When concurrent or near-concurrent requests are submitted for the same saved card, the system fails to recognize the second request as a duplicate, leading to race conditions and subsequent HTTP 500 errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests are honored correctly without triggering errors.
2.  **Testing**: Add regression tests specifically targeting concurrent submit scenarios to catch race conditions.
3.  **Monitoring**: Configure dashboard alerts to monitor HTTP 500 rates during checkout, ensuring early detection of similar issues in the future.
4.  **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions during QA.