# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow is experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short window (5 seconds). Approximately 30% of these rapid double-submissions result in a server error, impacting ~3% of total checkout attempts and resulting in revenue loss.

## Timeline
- **Release**: v2.3 deployed.
- **Incident Start**: Immediately post-deployment; intermittent 500 errors observed on saved-card payments.
- **Reproduction**: Login -> Add saved card -> Submit payment twice within 5 seconds.
- **Current State**: ~30% failure rate on concurrent submissions; ~3% of all checkout attempts affected.

## Root Cause
The payment processing logic introduced in v2.3 lacks robust handling for concurrent requests using the same payment context. Specifically:
- The system does not adequately enforce idempotency when multiple requests hit the payment gateway within a 5-second window.
- Race conditions in the transaction state machine lead to unhandled exceptions (HTTP 500) when the second request attempts to process before the first has fully committed or been rejected.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1. **Fix Idempotency**: Ensure the `idempotency_key` is strictly honored. Duplicate requests with the same key must return the result of the original request rather than attempting re-processing.
2. **Error Handling**: Update the payment service to gracefully handle concurrent submission attempts, ensuring no HTTP 500s are returned under load.
3. **Testing**: Add regression tests that simulate concurrent submit requests to verify idempotency and stability.
4. **Monitoring**: Configure a dashboard alert to trigger on elevated HTTP 500 rates specifically for the checkout endpoint.

**Acceptance Criteria**:
- [ ] Idempotency key is honored correctly.
- [ ] No HTTP 500 errors occur under concurrent submit scenarios.
- [ ] Regression test added and passing.
- [ ] Dashboard alert configured for 500 rate spikes.