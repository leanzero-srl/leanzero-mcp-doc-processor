# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue specifically affects users attempting to process payments with a saved card twice within a short timeframe (5 seconds). This bug impacts approximately 3% of checkout attempts, resulting in direct revenue loss and a degraded user experience.

## Timeline
*   **Release:** Version v2.3 was deployed.
*   **Incident Detection:** Post-release monitoring and user reports indicated a spike in 500 errors during the checkout process.
*   **Reproduction:** Engineers confirmed that submitting a payment twice within 5 seconds triggers the error ~30% of the time.
*   **Current Status:** Issue is under investigation; impact is quantified at ~3% of total checkout attempts.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment service layer introduced in v2.3. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize the duplicate request as idempotent. Instead of returning the result of the first transaction or a clear validation error, the service throws an unhandled exception, resulting in an HTTP 500 Internal Server Error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix:** Implement strict idempotency key validation to ensure duplicate requests within the grace period are handled gracefully.
*   **Testing:** Add regression tests specifically targeting concurrent submissions (double-click/tap scenarios) to verify no 500 errors occur under load.
*   **Monitoring:** Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for the checkout endpoint exceeds a defined threshold.
*   **Verification:** Confirm that the fix resolves the ~30% failure rate in staging under the repro conditions.