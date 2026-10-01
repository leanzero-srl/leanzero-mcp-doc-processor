# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, customers using saved cards for checkout experience intermittent HTTP 500 errors. The issue specifically manifests when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid duplicate submissions fail, resulting in an overall checkout failure rate of ~3%. This is a revenue-affecting issue requiring immediate remediation.

## Timeline

- **Release v2.3 Deployed**: Issue began appearing post-deployment.
- **Reproduction Confirmed**: Engineers reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
- **Impact Assessment**: Current failure rate estimated at ~3% of all checkout attempts.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. The system fails to correctly honor idempotency keys when concurrent or near-simultaneous payment requests are received, leading to race conditions that trigger HTTP 500 errors on the second request.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

- **Code Fix**: Implement robust idempotency key validation to ensure duplicate requests within the grace period are handled gracefully without throwing 500 errors.
- **Verification**: Confirm that no HTTP 500s occur under concurrent submit scenarios during testing.
- **Testing**: Add a regression test specifically covering the rapid duplicate submission use case.
- **Monitoring**: Configure a dashboard alert to notify the team if the HTTP 500 rate for checkout endpoints exceeds the baseline.
- **Acceptance Criteria**:
  - Idempotency key is honored.
  - No 500s under concurrent submit.
  - Regression test added.
  - Dashboard alert on the 500 rate.