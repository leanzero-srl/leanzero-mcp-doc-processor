# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window. Approximately 30% of the second attempts fail, resulting in an overall ~3% failure rate for checkout attempts. This is a revenue-affecting issue impacting user experience and transaction integrity.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Users reported intermittent checkout failures.
*   **Reproduction Confirmed**: Issue reliably reproduced by submitting payment twice within 5 seconds.
*   **Impact Assessment**: ~3% of all checkout attempts are failing due to HTTP 500s.

## Root Cause
The root cause is a lack of idempotency handling in the payment processing logic introduced in v2.3. When a payment request is submitted concurrently (within a 5-second window), the system fails to recognize the duplicate request, leading to a race condition that results in an HTTP 500 internal server error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key handling to ensure duplicate requests within the window are recognized and handled gracefully without throwing a 500 error.
2.  **Testing**: Add a regression test that simulates concurrent payment submissions to verify idempotency logic.
3.  **Monitoring**: Configure a dashboard alert to trigger on elevated HTTP 500 rates during the checkout flow.
4.  **Acceptance Criteria**: 
    *   Idempotency keys are honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test is added and passing.
    *   Dashboard alert is active for 500 rates.