# RCA: HTTP 500 on Saved-Card Checkout

## Summary
Intermittent HTTP 500 errors occur during saved-card checkout following release v2.3. The issue affects approximately 3% of checkout attempts, resulting in revenue loss. The error is triggered when a user submits a payment twice within a 5-second window.

## Timeline
- **Release v2.3**: Deployment introduced the regression.
- **Detection**: Intermittent 500 errors observed during concurrent payment submissions.
- **Impact Assessment**: Confirmed ~3% failure rate on checkout attempts.

## Root Cause
The payment processing service fails to handle concurrent requests with the same idempotency key correctly. When a second payment request is submitted within 5 seconds of the first, the system does not recognize the idempotency key, leading to a conflict or unhandled state that results in an HTTP 500 error.

## Remediation
- **Fix**: Ensure the idempotency key is properly honored to prevent duplicate processing.
- **Testing**: Add regression tests to cover concurrent submission scenarios.
- **Monitoring**: Implement a dashboard alert to trigger when the HTTP 500 rate exceeds acceptable thresholds.
- **Acceptance Criteria**:
  - Idempotency key is honored.
  - No 500 errors occur under concurrent submit conditions.
  - Regression tests are added.
  - Dashboard alert is configured for 500 rate monitoring.