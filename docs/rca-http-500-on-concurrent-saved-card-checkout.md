# RCA: HTTP 500 on Concurrent Saved-Card Checkout

## Summary

Following the release of version 2.3, the checkout endpoint for saved cards intermittently returns an HTTP 500 error. This issue is triggered by concurrent payment submissions and affects approximately 3% of checkout attempts, resulting in direct revenue loss.

## Timeline

- **Release v2.3 Deployed**: Introduction of changes affecting the payment processing flow.
- **Issue Detected**: Intermittent HTTP 500 errors observed in production logs.
- **Reproduction Identified**: Issue reproducible when submitting payment twice within a 5-second window.

## Root Cause

The payment service lacks proper idempotency handling for concurrent requests. When a user submits a payment twice within a short timeframe (e.g., <5s), the system processes the requests concurrently without checking for existing in-flight transactions. This race condition causes the second request to fail with an HTTP 500 error in ~30% of cases.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

- **Implement Idempotency Keys**: Ensure the payment service honors idempotency keys to safely handle duplicate requests.
- **Concurrency Control**: Add locking or state checks to prevent concurrent processing of the same transaction.
- **Regression Testing**: Add automated regression tests to cover concurrent submit scenarios.
- **Monitoring**: Create a dashboard alert to trigger on elevated HTTP 500 rates for the checkout endpoint.