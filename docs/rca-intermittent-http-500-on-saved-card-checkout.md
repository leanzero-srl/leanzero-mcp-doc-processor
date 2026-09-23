# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the deployment of release v2.3, the saved-card checkout process has been experiencing intermittent HTTP 500 errors. This issue affects approximately 3% of checkout attempts, resulting in direct revenue loss. The error is triggered specifically when a user submits a payment twice within a 5-second window using a saved card.

## Timeline
*   **Event**: Release v2.3 deployed.
*   **Observation**: Intermittent HTTP 500 errors reported on saved-card checkout.
*   **Reproduction**: Logging in, adding a saved card, and submitting payment twice within 5 seconds results in a 500 error on the second call ~30% of the time.
*   **Impact**: ~3% of total checkout attempts are failing.

## Root Cause
The root cause is a race condition in the payment processing logic introduced in v2.3. The system fails to properly handle concurrent payment submissions for the same transaction context, leading to a server-side exception (HTTP 500) when the second request is processed before the first completes.

## Remediation
1.  **Enforce Idempotency**: Ensure the payment service strictly honors idempotency keys to prevent duplicate processing of the same transaction.
2.  **Concurrency Handling**: Refactor the payment handler to manage concurrent submits gracefully, ensuring no HTTP 500s occur under load.
3.  **Testing**: Add a regression test that simulates concurrent payment submissions to verify the fix.
4.  **Monitoring**: Implement a dashboard alert to monitor the HTTP 500 rate on the checkout endpoint, enabling faster detection of similar future issues.