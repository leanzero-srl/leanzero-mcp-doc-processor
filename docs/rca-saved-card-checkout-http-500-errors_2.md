# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary

Following the release of v2.3, the saved-card checkout flow has been intermittently returning HTTP 500 errors. Specifically, submitting payment twice within a 5-second window causes the second request to fail approximately 30% of the time. This issue impacts roughly 3% of all checkout attempts, resulting in direct revenue loss.

## Timeline

*   **Release v2.3 Deployed:** Introduction of changes affecting the saved-card checkout endpoint.
*   **Incident Detected:** Users reported failed transactions when rapidly submitting payments.
*   **Reproduction Confirmed:** Internal testing replicated the issue: logging in, adding a saved card, and submitting payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Impact Assessment:** Estimated 3% of checkout attempts are failing, classified as revenue-affecting.

## Root Cause

The root cause is a **lack of idempotency handling** in the payment processing logic introduced in v2.3. When two concurrent requests are submitted for the same transaction within a short timeframe (within 5 seconds), the system fails to recognize the second request as a duplicate. Instead of rejecting it gracefully or returning the result of the first successful transaction, the backend encounters a race condition or state conflict, resulting in an HTTP 500 Internal Server Error.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Implement Idempotency Keys:** Ensure the payment endpoint strictly honors idempotency keys. Duplicate requests with the same key should return the result of the original request without re-processing.
2.  **Fix Concurrent Submit Logic:** Refactor the backend logic to handle concurrent submissions safely, ensuring no HTTP 500 errors occur under concurrent load.
3.  **Add Regression Tests:** Create automated test cases that simulate rapid, duplicate payment submissions to verify idempotency and error handling.
4.  **Monitor & Alert:** Configure the monitoring dashboard to trigger alerts when the HTTP 500 error rate for the checkout endpoint exceeds a defined threshold.

**Acceptance Criteria:**
*   Idempotency key is honored.
*   No HTTP 500 errors occur under concurrent submit conditions.
*   Regression test is added to the CI/CD pipeline.
*   Dashboard alert is active for checkout 500 rates.