# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow experiences intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a 500 error, impacting roughly 3% of all checkout attempts. This is a revenue-affecting issue requiring immediate remediation to ensure idempotency and system stability.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression in the payment processing logic.
*   **Incident Detected**: Users report failed payments; monitoring confirms HTTP 500 spikes correlated with rapid checkout submissions.
*   **Reproduction Confirmed**: Engineering successfully reproduces the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing; fix pending deployment.

## Root Cause
The root cause is a **lack of proper idempotency handling** for concurrent payment requests. The system fails to honor idempotency keys when multiple requests are received in quick succession, leading to race conditions that result in internal server errors (HTTP 500) instead of gracefully rejecting duplicate requests or returning the original transaction status.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation in the payment service to ensure duplicate requests within the timeout window return the original transaction result rather than triggering a 500 error.
2.  **Testing**: Add a regression test that simulates concurrent submissions (within 5s) to verify that no 500 errors occur and that idempotency is respected.
3.  **Monitoring**: Configure a dashboard alert to trigger when the HTTP 500 error rate for the checkout endpoint exceeds a defined threshold.

### Acceptance Criteria
- [ ] Idempotency keys are correctly honored during concurrent submissions.
- [ ] No HTTP 500 errors occur under concurrent submit conditions.
- [ ] Regression test added to the CI pipeline.
- [ ] Dashboard alert configured for checkout 500 error rate.