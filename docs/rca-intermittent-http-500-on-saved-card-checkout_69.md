# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue affects approximately 3% of checkout attempts, resulting in significant revenue impact. The error occurs specifically when a user submits a payment twice within a short timeframe (5 seconds).

## Timeline

*   **Release v2.3 Deployed**: Introduction of changes affecting the checkout payment handler.
*   **Incident Detected**: Monitoring alerts triggered due to elevated 500 error rates on the payment endpoint.
*   **Reproduction**: Confirmed that submitting payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Current Status**: Incident ongoing; revenue-impacting.

## Root Cause

The root cause is identified as a race condition in the payment processing logic introduced in v2.3. Specifically:

*   **Lack of Idempotency Enforcement**: The system does not strictly honor idempotency keys for concurrent requests.
*   **Race Condition**: When two payment requests are submitted within 5 seconds, the second request competes with the first for resource locking or state updates, leading to a null pointer exception or database constraint violation, resulting in an HTTP 500.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Ensure the payment handler strictly honors idempotency keys. Duplicate requests within the idempotency window must return the result of the first request without re-processing.
2.  **Concurrency Control**: Implement proper locking mechanisms to prevent concurrent submission of the same payment intent.
3.  **Testing**: Add regression tests that simulate concurrent submissions (within 5s) to verify no HTTP 500s occur.
4.  **Monitoring**: Configure dashboard alerts for the HTTP 500 rate on the checkout endpoint to enable faster detection of future regressions.

### Acceptance Criteria

*   [ ] Idempotency key is honored; duplicate requests do not trigger 500s.
*   [ ] No HTTP 500 errors under concurrent submit conditions.
*   [ ] Regression test added and passing.
*   [ ] Dashboard alert configured for 500 rate spikes.