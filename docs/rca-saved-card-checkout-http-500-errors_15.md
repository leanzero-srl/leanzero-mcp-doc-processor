# RCA: Saved-card checkout HTTP 500 errors

## Summary
Following the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors when users submit payments multiple times within a short window. Approximately 3% of checkout attempts are failing, resulting in revenue impact.

## Timeline
- **Release**: v2.3 deployed.
- **Issue Discovery**: Users reported intermittent checkout failures; engineering reproduced the issue during QA testing.
- **Current Status**: Issue is confirmed reproducible under specific concurrency conditions; remediation in progress.

## Root Cause
The root cause is a lack of proper idempotency handling for rapid, concurrent payment submissions. When a user submits the same saved-card payment twice within 5 seconds:
1. The first request processes normally.
2. The second request, arriving before the first completes or is fully committed, triggers a race condition in the payment processor integration.
3. This race condition results in an unhandled exception, causing the server to return a 500 Internal Server Error approximately 30% of the time under this specific load.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
- **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests within a short window are ignored or queued rather than processed concurrently.
- **Testing**: Add regression tests specifically targeting concurrent payment submissions to ensure the fix holds under load.
- **Monitoring**: Configure dashboard alerts to notify engineering if the HTTP 500 rate for checkout endpoints exceeds a defined threshold.
- **Acceptance Criteria**: 
  - Idempotency keys are honored correctly.
  - No HTTP 500 errors occur under concurrent submit scenarios.
  - Regression test suite includes concurrency checks.
  - Operational dashboards reflect real-time error rates.