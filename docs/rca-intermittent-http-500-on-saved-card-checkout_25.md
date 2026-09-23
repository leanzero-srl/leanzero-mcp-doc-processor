# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits a payment twice within a short window (5 seconds). Approximately 30% of these rapid double-submissions result in a server error, leading to an overall failure rate of ~3% of all checkout attempts. This is a revenue-affecting issue impacting user experience and transaction success.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detection**: Monitoring alerts and user reports indicate intermittent 500 errors during checkout.
*   **Reproduction**: Consistently reproduced by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: Estimated ~3% of total checkout attempts are failing, directly impacting revenue.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a second payment request is received within 5 seconds of the first, the system fails to recognize it as a duplicate due to missing or unenforced idempotency keys. This race condition causes the backend to attempt duplicate processing, leading to a state conflict and resulting in an HTTP 500 Internal Server Error.

## Remediation

1.  **Enforce Idempotency**: Ensure the payment API strictly honors the `Idempotency-Key` header. Duplicate requests with the same key must return the result of the original request rather than processing a new transaction.
2.  **Error Handling**: Implement robust error handling to prevent HTTP 500s in race conditions; return appropriate 4xx or 2xx responses based on idempotency checks.
3.  **Testing**: Add regression tests specifically covering concurrent submissions and idempotency key validation.
4.  **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during the checkout flow to enable faster future detection.
5.  **Deployment**: Deploy a hotfix patch to production to restore stable checkout functionality.