# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window; the second request fails approximately 30% of the time. This results in ~3% of checkout attempts failing, directly impacting revenue.

## Timeline
- **Event**: Release v2.3 deployed.
- **Observation**: Intermittent HTTP 500 errors detected on saved-card checkout.
- **Reproduction**: Log in -> Add saved card -> Submit payment twice within 5 seconds -> Second call 500s ~30% of the time.
- **Current Status**: Under investigation; impact quantified at ~3% failure rate.

## Root Cause
The root cause is identified as a race condition or lack of idempotency handling in the payment processing logic introduced in v2.3. Concurrent submission of the same payment request within a short timeframe (5s) leads to conflicting state updates or resource contention, causing the server to return a 500 error instead of handling the duplicate request gracefully.

## Remediation
1. **Immediate Fix**: Implement strict idempotency key validation to ensure duplicate requests within the window are rejected or handled idempotently without raising 500 errors.
2. **Testing**: Add a regression test that simulates concurrent payment submissions to prevent recurrence.
3. **Monitoring**: Configure a dashboard alert to trigger when the HTTP 500 rate for checkout endpoints exceeds a defined threshold.
4. **Acceptance Criteria**:
   - Idempotency keys are honored.
   - No HTTP 500s occur under concurrent submit conditions.
   - Regression test is added and passing.
   - Dashboard alert is active for 500 rate monitoring.