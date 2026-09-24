# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This issue affects roughly 3% of all checkout attempts, resulting in significant revenue loss and a degraded user experience.

## Timeline

*   **Release v2.3 Deployed**: Introduction of changes affecting the payment processing logic.
*   **Issue Detection**: Monitoring alerts triggered due to increased HTTP 500 error rates on the checkout endpoint.
*   **Reproduction**: Engineers confirmed that submitting a saved-card payment twice within 5 seconds triggers the failure ~30% of the time.
*   **Current Status**: Issue is impacting ~3% of checkout attempts; immediate remediation and regression testing are underway.

## Root Cause

The root cause is identified as a **lack of proper idempotency handling** in the payment service introduced in v2.3. The system fails to correctly honor idempotency keys when concurrent or near-concurrent requests are submitted within a short time window (5s). This leads to race conditions where the second request is processed as a new transaction rather than being deduplicated, resulting in a server-side state conflict and an HTTP 500 response.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Update the payment processing logic to strictly enforce and honor idempotency keys. Ensure that duplicate requests within the defined window return the result of the original request rather than attempting re-processing.
2.  **Testing**: Add specific regression tests that simulate concurrent submissions (within 5s) to verify that idempotency keys are correctly honored and no HTTP 500s occur.
3.  **Monitoring**: Implement a dashboard alert to notify the team immediately if the HTTP 500 error rate for the checkout endpoint exceeds a defined threshold.
4.  **Verification**: Confirm that under load testing with concurrent submits, the system remains stable and no 500 errors are generated.

### Acceptance Criteria

*   [ ] Idempotency key is honored correctly.
*   [ ] No HTTP 500 errors occur under concurrent submit conditions.
*   [ ] Regression test added to CI/CD pipeline.
*   [ ] Dashboard alert configured for HTTP 500 rate spikes.