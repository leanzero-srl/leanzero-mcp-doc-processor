# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid duplicate submissions result in a 500 error, impacting roughly 3% of total checkout attempts and causing direct revenue loss.

## Timeline

*   **Release v2.3 Deployed:** Introduction of the regression.
*   **Incident Detection:** Monitoring alerts triggered by elevated 500 error rates on the payment endpoint.
*   **Reproduction:** Confirmed that submitting a payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Impact Assessment:** Estimated 3% of all checkout attempts are failing, resulting in revenue loss.

## Root Cause

The root cause is identified as a **lack of idempotency handling** in the payment processing logic introduced in v2.3. The system fails to properly recognize or honor idempotency keys when duplicate requests are received in rapid succession (within the 5-second window). This race condition leads to conflicting state updates or database locks, resulting in an HTTP 500 Internal Server Error instead of a graceful rejection or successful deduplication.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Implement strict idempotency key validation in the payment service to ensure duplicate requests within the window return the original response or a safe 200 OK, preventing the 500 error.
2.  **Testing:** Add regression tests specifically covering concurrent/rapid duplicate submissions to ensure idempotency logic holds under load.
3.  **Monitoring:** Configure dashboard alerts to trigger when the HTTP 500 rate for the checkout endpoint exceeds a defined threshold.
4.  **Verification:** Validate that no 500 errors occur under concurrent submit scenarios during QA.