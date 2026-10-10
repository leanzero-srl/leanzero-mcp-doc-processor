# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the deployment of release v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue specifically affects users attempting to submit payments twice within a short timeframe (under 5 seconds). This results in approximately 3% of checkout attempts failing, leading to direct revenue loss.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Observed**: Users report failed payment attempts when rapidly submitting the same saved card.
*   **Reproduction**: Engineering confirmed that submitting a payment twice within 5 seconds triggers a 500 error on the second attempt ~30% of the time.
*   **Impact Assessment**: Current failure rate is estimated at ~3% of all checkout attempts.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a second payment request is received from the same user within a 5-second window, the system fails to recognize the duplicate request, leading to a concurrent processing conflict that results in an HTTP 500 error.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests within the short window are handled gracefully (e.g., returning the result of the first successful transaction rather than throwing an error).
*   **Testing**: Add regression tests specifically targeting concurrent submit scenarios to ensure idempotency keys are honored.
*   **Monitoring**: Configure dashboard alerts to trigger when the HTTP 500 rate for the checkout endpoint exceeds acceptable thresholds.
*   **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions in the staging environment before deploying to production.