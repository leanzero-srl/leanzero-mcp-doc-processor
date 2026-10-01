# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary

Following the release of v2.3, the saved-card checkout process has exhibited intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This issue impacts roughly 3% of all checkout attempts, resulting in significant revenue loss.

## Timeline

*   **Release v2.3 Deployed:** Introduction of the regression.
*   **Incident Detection:** Monitoring identified a spike in HTTP 500 errors correlated with rapid duplicate payment submissions.
*   **Current Status:** Issue is actively impacting ~3% of transaction volume.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When two concurrent requests are submitted within a short timeframe (≤5s), the system fails to recognize the second request as a duplicate, leading to a race condition or state conflict that triggers a server error (HTTP 500).

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Ensure the payment service strictly honors idempotency keys. Duplicate requests with the same key must return the result of the original request rather than processing a new transaction.
2.  **Testing:** Add regression tests that simulate concurrent submission of payment requests to verify the idempotency logic holds under load.
3.  **Observability:** Configure dashboard alerts to trigger on HTTP 500 rates exceeding the baseline during checkout flows.
4.  **Verification:** Confirm that no HTTP 500s occur under concurrent submit conditions in the staging environment before re-deployment.