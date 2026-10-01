# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow is experiencing intermittent HTTP 500 errors. The issue affects approximately 3% of checkout attempts, resulting in revenue loss. The error occurs specifically when submitting payment twice within a short timeframe (5 seconds) using a saved card.

## Timeline
- **Release**: v2.3 deployed.
- **Incident Start**: Immediately post-deployment; intermittent 500 errors observed during saved-card checkouts.
- **Reproduction**: Logged in, added a saved card, and submitted payment twice within 5 seconds. The second call failed with a 500 status code ~30% of the time.
- **Current Impact**: ~3% of all checkout attempts are failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment submission logic introduced in v2.3. When two payment requests are submitted concurrently (within a 5-second window), the system fails to honor the idempotency key, leading to race conditions that result in HTTP 500 errors instead of gracefully handling the duplicate request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1. **Code Fix**: Ensure the payment service strictly honors the idempotency key. Duplicate requests within the specified window should return the result of the original request rather than attempting to process a new transaction.
2. **Testing**: Add regression tests that simulate concurrent payment submissions to verify that no 500 errors occur under load.
3. **Monitoring**: Implement a dashboard alert to monitor the HTTP 500 error rate for the checkout endpoint, ensuring rapid detection of similar issues in the future.

**Acceptance Criteria**:
- [ ] Idempotency key is honored correctly.
- [ ] No HTTP 500 errors occur under concurrent submit conditions.
- [ ] Regression test added and passing.
- [ ] Dashboard alert configured for 500 error rate.