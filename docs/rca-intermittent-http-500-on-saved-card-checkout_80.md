# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This results in an overall checkout failure rate of ~3%, impacting revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of changes to the checkout payment handler.
*   **Incident Detected**: Monitoring alerted on elevated 500 error rates during checkout.
*   **Reproduction**: Engineers confirmed the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Investigation ongoing to implement idempotency fixes.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When duplicate requests are submitted rapidly (within 5 seconds), the backend fails to recognize them as identical due to missing or ignored idempotency keys. This race condition leads to a state inconsistency, resulting in an HTTP 500 error on the second attempt.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation in the payment service. Ensure that duplicate keys are honored and return the result of the original request rather than processing a new transaction.
2.  **Testing**: Add regression tests that simulate concurrent submissions within a 5-second window to verify no 500 errors occur.
3.  **Monitoring**: Configure a dashboard alert to trigger when the HTTP 500 rate for the checkout endpoint exceeds a defined threshold.
4.  **Deployment**: Schedule a hotfix release to apply the idempotency fix and validate acceptance criteria.