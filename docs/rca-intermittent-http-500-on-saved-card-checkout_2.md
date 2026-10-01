# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has exhibited intermittent HTTP 500 errors. The issue is triggered when a user submits a payment twice within a 5-second window. This results in approximately 3% of checkout attempts failing, causing significant revenue impact.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Issue Detected**: Users report intermittent failures during checkout.
*   **Reproduction Confirmed**: 
    *   Action: Log in, add a saved card, submit payment.
    *   Condition: Submit payment a second time within 5 seconds.
    *   Result: Second call returns HTTP 500 ~30% of the time.
*   **Impact Assessment**: ~3% of total checkout attempts are failing.

## Root Cause

The system lacks proper idempotency handling for concurrent payment submissions. When a second payment request is received within the 5-second window, the backend fails to recognize the duplicate intent, leading to a race condition or state conflict that triggers an HTTP 500 error.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Fix Idempotency**: Ensure the idempotency key is correctly honored to prevent duplicate processing.
2.  **Eliminate 500 Errors**: Refactor the payment handler to gracefully handle concurrent submits without throwing server errors.
3.  **Add Regression Tests**: Implement automated tests to verify that no HTTP 500s occur under concurrent submit conditions.
4.  **Monitoring**: Configure dashboard alerts to trigger if the HTTP 500 rate spikes, enabling faster future detection.