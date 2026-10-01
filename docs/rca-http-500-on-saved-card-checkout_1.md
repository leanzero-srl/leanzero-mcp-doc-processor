# RCA: HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window; the second call fails approximately 30% of the time. This results in ~3% of checkout attempts failing, directly impacting revenue.

## Timeline
- **Event**: Release v2.3 deployed.
- **Observation**: Intermittent HTTP 500 errors on saved-card checkout.
- **Reproduction**: Log in → Add saved card → Submit payment twice within 5 seconds.
- **Impact**: ~30% failure rate on rapid double-submit; ~3% overall checkout failure rate.

## Root Cause
The system lacks proper handling for concurrent payment submissions within a short timeframe. Specifically, the idempotency key mechanism is not being honored correctly under high concurrency, leading to race conditions that trigger server-side errors (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
- **Fix**: Ensure idempotency keys are strictly honored to prevent duplicate processing.
- **Testing**: Implement regression tests simulating concurrent submits to verify no HTTP 500s occur.
- **Monitoring**: Add a dashboard alert for spikes in the HTTP 500 rate during checkout operations.
- **Acceptance Criteria**:
  - Idempotency key honored under load.
  - Zero HTTP 500s during concurrent submit scenarios in tests.
  - Regression test added and passing.
  - Dashboard alert configured for error rate monitoring.