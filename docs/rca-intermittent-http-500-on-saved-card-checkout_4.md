# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow is experiencing intermittent HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a failure, affecting ~3% of total checkout attempts and causing revenue loss.

## Timeline

*   **Release v2.3 Deployed**: Issue introduced in production.
*   **Incident Detected**: Monitoring alerts triggered for elevated 500 error rates on the checkout endpoint.
*   **Reproduction**: Confirmed that submitting a payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated 3% of checkout attempts are failing due to this race condition.

## Root Cause

The root cause is a lack of proper idempotency handling for concurrent payment submissions. The system does not correctly honor idempotency keys when multiple requests are received in quick succession, leading to a race condition that results in an HTTP 500 Internal Server Error on the second request.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix**: Ensure the payment processing logic strictly honors idempotency keys to prevent duplicate processing or race conditions.
*   **Testing**: Add a regression test that simulates concurrent payment submissions to verify stability.
*   **Monitoring**: Implement a dashboard alert to monitor the HTTP 500 error rate on the checkout endpoint for early detection of similar issues.
*   **Verification**: Confirm that no HTTP 500s occur under concurrent submit scenarios.