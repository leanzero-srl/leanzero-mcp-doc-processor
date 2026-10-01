# RCA: Saved-card checkout HTTP 500 errors

## Summary
Intermittent HTTP 500 errors occur during saved-card checkout following the release of v2.3. The issue is triggered by rapid consecutive payment submissions, affecting approximately 3% of checkout attempts and resulting in revenue loss.

## Timeline
- **Release**: v2.3 deployed.
- **Observation**: Users report intermittent 500 errors when submitting payments with saved cards.
- **Reproduction**: Logging in, adding a saved card, and submitting payment twice within 5 seconds results in the second call failing with HTTP 500 ~30% of the time.

## Root Cause
The payment processing logic lacks proper idempotency handling for rapid concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or pending transaction, leading to a race condition and subsequent HTTP 500 error.

## Remediation
- **Immediate Fix**: Implement strict idempotency key validation to ensure duplicate requests are handled gracefully without throwing errors.
- **Testing**: Add regression tests specifically targeting concurrent payment submissions to prevent recurrence.
- **Monitoring**: Configure dashboard alerts to monitor HTTP 500 rates during checkout, enabling rapid detection of similar issues in the future.
- **Acceptance Criteria**:
  - Idempotency key is honored for all payment requests.
  - No HTTP 500 errors occur under concurrent submit scenarios.
  - Regression test coverage added for this edge case.
  - Dashboard alert configured on checkout 500 error rate.