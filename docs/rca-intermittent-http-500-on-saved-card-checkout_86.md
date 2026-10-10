# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a 500 error, impacting roughly 3% of total checkout attempts. This is a revenue-affecting incident requiring immediate remediation to ensure idempotency and system stability.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression in the payment processing logic.
*   **Incident Detection**: Monitoring alerts triggered on elevated 500 error rates for the `/checkout` endpoint.
*   **Reproduction**: Confirmed reproducible by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; root cause identified as lack of idempotency handling.

## Root Cause
The root cause is a **missing idempotency check** in the payment processing service introduced in v2.3. The system fails to recognize duplicate requests for the same transaction when they arrive within a short time window (<5s). Consequently, concurrent submissions attempt to process the same charge twice, leading to a race condition that results in a 500 Internal Server Error on the second attempt.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Implement Idempotency Keys**: Ensure the backend honors idempotency keys for all checkout requests. Duplicate requests with the same key should return the original response rather than attempting re-processing.
2.  **Code Fix**: Update the payment service to validate and lock transactions based on idempotency keys before processing.
3.  **Regression Testing**: Add automated tests to verify that concurrent submissions (within 5s) do not result in 500 errors and that the second request returns a successful or pending status consistent with the first.
4.  **Monitoring & Alerts**: Configure dashboard alerts to trigger if the 500 error rate for the checkout endpoint exceeds a defined threshold (e.g., >1%).

### Acceptance Criteria
- [ ] Idempotency keys are honored for saved-card checkouts.
- [ ] No HTTP 500 errors occur under concurrent submit conditions.
- [ ] Regression test added to CI/CD pipeline.
- [ ] Dashboard alert configured for 500 error rate spikes.