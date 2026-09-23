# RCA: Saved-card checkout HTTP 500 errors

## Summary
After the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors during rapid consecutive payment submissions. Approximately 3% of checkout attempts fail, impacting revenue.

## Timeline
- **Release**: v2.3 deployed.
- **Observation**: Intermittent HTTP 500 errors observed on saved-card checkout.
- **Reproduction**: Logging in, adding a saved card, and submitting payment twice within 5 seconds results in the second call returning HTTP 500 ~30% of the time.

## Root Cause
The payment processing logic does not properly handle concurrent requests for the same saved card within a short timeframe. Specifically, idempotency keys are not being honored effectively under high concurrency, leading to race conditions that trigger server-side errors (HTTP 500).

## Remediation
1. **Ensure Idempotency**: Verify and enforce that idempotency keys are strictly honored to prevent duplicate processing.
2. **Concurrency Handling**: Implement robust locking or queuing mechanisms to handle concurrent submit requests for the same card.
3. **Testing**: Add regression tests specifically targeting concurrent payment submissions to ensure no HTTP 500s occur under load.
4. **Monitoring**: Configure dashboard alerts to monitor and notify on increased HTTP 500 rates during checkout processes.