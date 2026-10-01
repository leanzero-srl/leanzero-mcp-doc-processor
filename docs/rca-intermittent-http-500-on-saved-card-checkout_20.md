# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow experiences intermittent HTTP 500 errors. Specifically, submitting payment twice within a 5-second window results in a failure approximately 30% of the time on the second attempt. This impacts roughly 3% of all checkout attempts, posing a direct risk to revenue.

## Timeline

*   **Release v2.3 Deployed**: Introduction of changes affecting the checkout payment handler.
*   **Incident Detected**: Monitoring alerts triggered for increased HTTP 500 rates during checkout.
*   **Reproduction Confirmed**: Engineers successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within a 5-second interval.
*   **Impact Assessment**: Estimated ~3% of checkout attempts fail, resulting in lost revenue and customer frustration.

## Root Cause

The root cause is a **race condition in the payment processing logic** introduced in v2.3. The system fails to properly handle concurrent requests for the same transaction when idempotency keys are not correctly enforced or validated under high-frequency submission scenarios. This leads to a state conflict that triggers an unhandled exception (HTTP 500).

## Remediation

### Immediate Actions
*   **Hotfix Deployed**: Patched the payment handler to strictly enforce idempotency keys for all checkout submissions.
*   **Monitoring Enhanced**: Added dashboard alerts to monitor HTTP 500 rates specifically on the `/checkout` endpoint.

### Long-Term Improvements
*   **Code Review**: Conducted a full audit of concurrency handling in the payment service.
*   **Testing**: Added regression tests to simulate concurrent submissions and verify idempotency key honoring.
*   **Acceptance Criteria Met**:
    *   Idempotency keys are now strictly honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test suite includes concurrent payment scenarios.
    *   Dashboard alerting is active for checkout 500 rates.