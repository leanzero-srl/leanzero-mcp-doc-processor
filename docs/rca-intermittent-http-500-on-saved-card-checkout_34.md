# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has experienced intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This results in a ~3% failure rate for checkout attempts, directly impacting revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of changes affecting saved-card processing.
*   **Incident Detection**: Monitoring alerted on increased HTTP 500 rates during checkout.
*   **Reproduction**: Confirmed that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Current Status**: Under investigation; immediate remediation planned to ensure idempotency.

## Root Cause Analysis
The root cause is identified as a lack of proper idempotency handling for concurrent payment submissions on saved cards. The system does not adequately honor idempotency keys when duplicate requests are received in rapid succession, leading to race conditions and subsequent HTTP 500 errors during the second submission attempt.

## Remediation Plan
To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix**: Ensure the payment gateway logic strictly honors idempotency keys, preventing duplicate processing.
*   **Testing**: Add regression tests specifically targeting concurrent submission scenarios (double-click within 5s).
*   **Monitoring**: Implement a dashboard alert for HTTP 500 rates on the checkout endpoint to enable faster future detection.
*   **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions in staging before re-release.