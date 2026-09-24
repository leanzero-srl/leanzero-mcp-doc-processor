# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has exhibited intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a short window (5 seconds). Approximately 30% of these rapid double-submissions result in a 500 error, affecting ~3% of total checkout attempts and impacting revenue.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detection**: Monitoring detects elevated 500 error rates during checkout.
*   **Reproduction**: Engineering confirms that submitting a saved-card payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated 3% of all checkout attempts are failing due to this race condition.

## Root Cause

The root cause is a **race condition in the payment processing logic** introduced in v2.3. The system fails to properly handle concurrent requests for the same transaction when an idempotency key is not strictly enforced or checked before processing. This leads to a state collision, resulting in an unhandled exception and an HTTP 500 response.

## Remediation

### Immediate Actions
*   **Hotfix Deployed**: Implemented strict idempotency key validation to reject duplicate requests within the time window.
*   **Verification**: Confirmed that concurrent submissions now return appropriate 409 Conflict or 200 Success responses instead of 500 errors.

### Long-Term Improvements
*   **Regression Testing**: Added automated test cases to simulate concurrent payment submissions under load.
*   **Monitoring**: Configured dashboard alerts to trigger notifications if the HTTP 500 rate for the checkout endpoint exceeds the baseline threshold.
*   **Code Review**: Updated guidelines to mandate idempotency checks for all state-changing financial transactions.