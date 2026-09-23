# RCA: Saved-card checkout HTTP 500 errors

## Summary

Following the release of v2.3, the saved-card checkout flow has been intermittently returning HTTP 500 errors. The issue occurs during rapid sequential payment submissions, resulting in approximately 3% of checkout attempts failing. This is a revenue-affecting incident requiring immediate remediation to ensure idempotency and system stability.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the bug into the production environment.
*   **Incident Detected**: Users report intermittent 500 errors during checkout.
*   **Reproduction Confirmed**: Engineering verified that submitting payment twice within a 5-second window triggers the failure ~30% of the time.
*   **Current Status**: Incident active; impact estimated at 3% of total checkout attempts.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing service introduced in v2.3. When a user submits a payment request twice within a short timeframe (5 seconds), the system fails to recognize the second request as a duplicate. Instead of returning a success or existing transaction ID, the race condition or lack of locking causes a server-side exception, resulting in an HTTP 500 error.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix**: Implement strict idempotency key validation in the payment service to ensure duplicate requests within the window are handled gracefully without throwing 500 errors.
*   **Testing**: Add regression tests specifically targeting concurrent/rapid submission scenarios to verify the fix.
*   **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during the checkout flow to enable faster detection of future incidents.
*   **Acceptance Criteria**:
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test coverage added.
    *   Dashboard alerting is active.