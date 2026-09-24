# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout experiences intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window; the second request fails approximately 30% of the time. This results in a ~3% failure rate for checkout attempts, directly impacting revenue.

## Timeline
- **Release v2.3 Deployed**: Incident begins observed post-deployment.
- **Reproduction Confirmed**: Issue consistently reproducible by logging in, adding a saved card, and submitting payment twice within 5 seconds.
- **Impact Assessment**: ~30% failure rate on rapid double-submit; ~3% overall checkout failure rate.

## Root Cause
The payment processing logic lacks proper idempotency handling for concurrent or near-simultaneous requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or handle the race condition gracefully, resulting in an HTTP 500 error instead of honoring the idempotency key or returning a success/already-processed status.

## Remediation
1. **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests are handled correctly without throwing 500 errors.
2. **Testing**: Add regression tests specifically covering concurrent submit scenarios under the 5-second window.
3. **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during checkout flows.
4. **Acceptance Criteria Verification**:
   - Idempotency key is honored.
   - No HTTP 500s occur under concurrent submit conditions.
   - Regression test suite includes this scenario.
   - Dashboard alerting is active.