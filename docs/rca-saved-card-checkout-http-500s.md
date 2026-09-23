# RCA: Saved-card checkout HTTP 500s

## Summary
Following the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors. This issue affects approximately 3% of checkout attempts, resulting in revenue loss.

## Timeline
- **Release v2.3**: Deployment introduced the regression.
- **Issue Detection**: Identified via increased 500 error rates during checkout.
- **Reproduction**: Confirmed by logging in, adding a saved card, and submitting payment twice within 5 seconds.

## Root Cause
- **Concurrency Issue**: The second payment submission within a 5-second window triggers an HTTP 500 error ~30% of the time.
- **Idempotency Failure**: The system fails to properly honor idempotency keys under concurrent requests, leading to unhandled errors.

## Remediation
- **Fix Idempotency**: Ensure idempotency keys are correctly honored to prevent duplicate processing errors.
- **Eliminate 500s**: Implement robust error handling to prevent HTTP 500 responses under concurrent submit scenarios.
- **Testing**: Add regression tests to cover concurrent payment submissions.
- **Monitoring**: Add a dashboard alert to monitor the rate of HTTP 500 errors during checkout.