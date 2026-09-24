# RCA: Intermittent HTTP 500 on Saved-Card Checkout Post-v2.3

## Summary

Following the release of v2.3, the saved-card checkout flow is intermittently returning HTTP 500 errors. The issue affects approximately 30% of attempts when a user submits payment twice within a 5-second window, resulting in an overall failure rate of ~3% of all checkout attempts. This has a direct negative impact on revenue.

## Timeline

*   **Release v2.3 Deployed**: Introduction of changes affecting the checkout endpoint.
*   **Incident Detected**: Users report failed transactions; monitoring shows spike in HTTP 500s during high-concurrency checkout attempts.
*   **Reproduction Confirmed**: Engineering team successfully reproduces the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Under investigation; impact is ~3% of total checkout attempts.

## Root Cause

The root cause is identified as a lack of proper idempotency handling in the payment processing logic introduced in v2.3. Specifically:

*   The system fails to honor idempotency keys for concurrent or near-concurrent submission requests.
*   When two payment requests are submitted within a short timeframe (<5s), the second request races with the first, leading to a database constraint violation or state inconsistency that triggers an unhandled exception (HTTP 500).

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Enforce strict idempotency key validation in the checkout service to ensure duplicate submissions return the original transaction result rather than attempting re-processing.
2.  **Testing**: Add regression tests covering concurrent checkout submissions to ensure idempotency is maintained under load.
3.  **Monitoring**: Implement a dashboard alert to notify on-call engineers immediately if the HTTP 500 rate for the checkout endpoint exceeds baseline thresholds.
4.  **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions in staging before deploying the fix.

### Acceptance Criteria

- [ ] Idempotency key is correctly honored and prevents duplicate processing.
- [ ] No HTTP 500 errors occur during concurrent checkout submissions.
- [ ] Regression test suite includes scenarios for concurrent submissions.
- [ ] Dashboard alert configured for checkout 500 error rate.