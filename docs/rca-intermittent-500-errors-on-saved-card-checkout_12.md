# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a short timeframe (under 5 seconds), with the second request failing approximately 30% of the time. This results in a ~3% failure rate for all checkout attempts, directly impacting revenue.

## Timeline
* **Release v2.3 Deployed**: Introduction of the regression.
* **Observation**: Users report failed transactions when rapidly submitting payments.
* **Reproduction**: Confirmed reproducible by logging in, adding a saved card, and submitting payment twice within 5 seconds.
* **Current Status**: ~30% failure rate on the second concurrent submit call.

## Root Cause
The system is not correctly handling concurrent payment submissions for saved cards. Specifically, the **idempotency key mechanism is not being honored** under concurrent load, leading to race conditions that trigger internal server errors (HTTP 500) instead of returning the result of the first successful transaction or a proper conflict error.

## Remediation Plan
To resolve this issue and prevent recurrence, the following actions are required:

1. **Fix Idempotency Logic**: Ensure the backend strictly honors idempotency keys for payment submissions, preventing duplicate processing and race conditions.
2. **Eliminate 500 Errors**: Refactor the payment handler to gracefully handle concurrent requests without throwing internal server errors.
3. **Add Regression Tests**: Implement automated tests that simulate concurrent submissions to verify idempotency key behavior and stability.
4. **Monitoring & Alerts**: Configure dashboard alerts to monitor the HTTP 500 error rate specifically for the checkout endpoint, ensuring early detection of similar issues in the future.

**Acceptance Criteria**:
- [ ] Idempotency keys are honored.
- [ ] No HTTP 500 errors occur under concurrent submit conditions.
- [ ] Regression test suite includes concurrency scenarios.
- [ ] Dashboard alert is active for checkout 500 error rates.