# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has exhibited intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This results in an overall checkout failure rate of ~3%, posing a significant revenue risk.

## Timeline

- **v2.3 Release**: Deployment completed.
- **Post-Release Monitoring**: Alerts triggered on increased 500 error rates during checkout.
- **Reproduction**: Confirmed that submitting payment twice within <5s triggers the failure in ~30% of attempts.
- **Current Status**: Under investigation; impact estimated at ~3% of total checkout attempts.

## Root Cause

The root cause is identified as a lack of proper idempotency handling in the payment processing logic introduced in v2.3. Concurrent submissions (within a 5-second window) bypass the idempotency key check, leading to race conditions that result in HTTP 500 errors on the second request.

## Remediation

1. **Immediate Fix**: Enforce strict idempotency key validation to ensure duplicate requests within a short timeframe return the original response rather than triggering a new processing cycle.
2. **Code Fix**: Update payment service logic to handle concurrent requests gracefully, preventing 500 errors under load.
3. **Testing**: Add regression tests specifically targeting concurrent payment submissions to ensure idempotency is maintained.
4. **Monitoring**: Configure dashboard alerts to monitor HTTP 500 rates during checkout, enabling faster detection of similar issues in the future.
5. **Acceptance Criteria Verification**:
   - Idempotency key is honored.
   - No HTTP 500s occur under concurrent submit conditions.
   - Regression tests are in place and passing.
   - Dashboard alerting is active and functional.