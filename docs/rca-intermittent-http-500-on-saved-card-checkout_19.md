# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a 5-second window; the second request fails approximately 30% of the time. This results in an overall failure rate of ~3% of all checkout attempts, directly impacting revenue.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Observation**: Users report failed transactions when rapidly submitting payments.
*   **Reproduction Confirmed**: Logging in, adding a saved card, and submitting payment twice within 5 seconds triggers the 500 error in ~30% of cases.
*   **Current Status**: Issue is impacting ~3% of total checkout attempts.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. The system fails to properly recognize or honor idempotency keys when concurrent or near-concurrent requests are submitted within a short timeframe (specifically <5 seconds). This leads to race conditions that result in HTTP 500 internal server errors rather than gracefully handling the duplicate request.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Ensure the payment gateway integration strictly honors idempotency keys. Duplicate requests with the same key should return the result of the original request rather than throwing an error.
2.  **Testing**: Add a regression test case that simulates concurrent submissions (within 5s) to verify no HTTP 500s occur.
3.  **Monitoring**: Implement a dashboard alert for the HTTP 500 rate on the checkout endpoint to enable faster detection of similar issues in the future.
4.  **Acceptance Criteria Verification**:
    *   Idempotency key is honored.
    *   No 500 errors under concurrent submit conditions.
    *   Regression test exists and passes.
    *   Dashboard alert is active.