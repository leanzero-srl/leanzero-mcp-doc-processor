# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits a payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a server error, impacting roughly 3% of total checkout attempts. This is a revenue-affecting issue requiring immediate remediation to ensure idempotency and system stability.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression in the payment processing logic.
*   **Incident Detected**: Monitoring/alerting triggered by increased HTTP 500 rates on the `/checkout` endpoint.
*   **Reproduction Confirmed**: QA verified that submitting payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Root Cause Identified**: Lack of proper idempotency handling for concurrent requests on saved-card transactions.

## Root Cause

The root cause is a race condition in the payment processing service introduced in v2.3. The system fails to honor idempotency keys when multiple requests are received in rapid succession (<5s). Instead of rejecting the second request as a duplicate, the backend attempts to process the transaction again, leading to a database constraint violation or state inconsistency that results in an HTTP 500 Internal Server Error.

## Remediation

### Immediate Actions
1.  **Code Fix**: Update the payment controller to strictly validate and honor idempotency keys. Ensure that duplicate requests within the window are rejected with an HTTP 409 Conflict or 200 OK (if already processed), rather than attempting re-processing.
2.  **Hotfix Deployment**: Deploy the fix to production to stop the 500 errors immediately.

### Long-Term Improvements
1.  **Regression Testing**: Add automated test cases covering concurrent submission scenarios for saved-card checkouts.
2.  **Monitoring**: Configure dashboard alerts for the HTTP 500 rate on the checkout endpoint to enable faster detection of future regressions.
3.  **Acceptance Criteria Verification**: Ensure all future releases meet the following criteria:
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression tests pass for idempotency logic.
    *   Dashboard alerts are active for error rate spikes.