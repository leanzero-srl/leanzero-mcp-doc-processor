# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits payment twice in rapid succession (within 5 seconds). Approximately 30% of these duplicate submissions result in a 500 error, affecting roughly 3% of total checkout attempts. This is a revenue-impacting issue requiring immediate remediation to ensure idempotency and system stability.

## Timeline

- **Release v2.3 Deployed**: Introduction of the regression.
- **Observation**: Users report inconsistent checkout failures after adding a saved card.
- **Reproduction**: Automated testing confirms that submitting payment twice within a 5-second window triggers a 500 error ~30% of the time.
- **Impact Assessment**: Estimated 3% of all checkout attempts are failing due to this race condition.

## Root Cause

The root cause is a **race condition in the payment processing service** introduced in v2.3. The system fails to properly handle concurrent requests for the same transaction when an idempotency key is not strictly enforced or validated during the initial write operation. This leads to a state conflict or null pointer exception when the second request attempts to process a payment that is already being handled or has just completed.

## Remediation

To resolve this issue, the following actions are required:

1. **Enforce Idempotency**: Ensure the backend strictly honors the `Idempotency-Key` header. Duplicate requests with the same key must return the result of the original request rather than attempting re-processing.
2. **Fix Concurrency Handling**: Implement database-level locking or optimistic concurrency controls to prevent race conditions during the payment state transition.
3. **Add Regression Tests**: Create automated test cases that simulate concurrent submissions (two calls within 5 seconds) to verify no 500 errors occur.
4. **Monitoring & Alerts**: Configure a dashboard alert for the 500 error rate specifically on the `/checkout/payment` endpoint to enable faster detection of future regressions.

### Acceptance Criteria

- [ ] Idempotency key is honored for all payment submissions.
- [ ] No HTTP 500 errors occur under concurrent submit scenarios.
- [ ] Regression test added to CI/CD pipeline.
- [ ] Dashboard alert configured for 500 rate spikes.