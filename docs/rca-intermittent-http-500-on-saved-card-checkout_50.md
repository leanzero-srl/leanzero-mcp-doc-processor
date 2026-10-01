# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a 500 error, affecting ~3% of total checkout attempts and impacting revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Users report intermittent failures during checkout.
*   **Reproduction Confirmed**: Issue consistently reproducible by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: ~3% of checkout attempts fail; classified as revenue-affecting.

## Root Cause
The system lacks proper idempotency handling for rapid, concurrent payment submissions. Specifically:
*   The backend does not strictly honor idempotency keys for subsequent calls made within the short time window.
*   Concurrent requests are processed as separate transactions, leading to a race condition or state conflict that triggers an HTTP 500 Internal Server Error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Ensure the payment processor strictly honors idempotency keys to ignore duplicate requests within the window.
*   **Testing**: Add a regression test that simulates concurrent submit requests to verify no HTTP 500s occur.
*   **Monitoring**: Implement a dashboard alert for the HTTP 500 rate on the checkout endpoint to enable faster detection of future anomalies.
*   **Verification**: Confirm that under concurrent submit conditions, no 500 errors are returned and the second call is handled idempotently.