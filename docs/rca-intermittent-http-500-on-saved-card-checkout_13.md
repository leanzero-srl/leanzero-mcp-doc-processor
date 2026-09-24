# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This issue impacts ~3% of all checkout attempts, resulting in direct revenue loss.

## Timeline
- **Release**: Version v2.3 deployed.
- **Incident Start**: Immediately post-deployment; intermittent 500 errors observed on saved-card transactions.
- **Reproduction**: Validated that submitting payment twice within 5 seconds triggers the failure ~30% of the time.
- **Current Status**: Active impact on revenue; remediation planned.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. The system does not correctly honor idempotency keys for rapid, concurrent submission attempts, leading to race conditions that result in HTTP 500 errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
- **Code Fix**: Ensure idempotency keys are strictly honored to prevent duplicate processing errors.
- **Testing**: Add regression tests to simulate concurrent submits and verify no HTTP 500s occur under load.
- **Monitoring**: Implement a dashboard alert to trigger notifications when the HTTP 500 rate exceeds defined thresholds.
- **Acceptance Criteria**: 
  - Idempotency key honored.
  - No 500s under concurrent submit.
  - Regression test added.
  - Dashboard alert on the 500 rate.