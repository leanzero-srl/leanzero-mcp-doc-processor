# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary

Following the release of v2.3, the saved-card checkout process is experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This issue impacts roughly 3% of all checkout attempts, resulting in direct revenue loss.

## Timeline

*   **Release v2.3 Deployed:** The regression was introduced in this release.
*   **Incident Detection:** Monitoring identified a spike in HTTP 500 errors correlated with rapid successive payment submissions.
*   **Reproduction:** Confirmed that submitting a payment twice within 5 seconds triggers the failure ~30% of the time.
*   **Impact Assessment:** Estimated 3% of total checkout attempts are currently failing.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. The system does not correctly honor idempotency keys when concurrent or near-concurrent requests are submitted, leading to race conditions that result in internal server errors (HTTP 500) rather than returning the status of the first successful transaction.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Ensure the payment service strictly honors idempotency keys, returning the result of the initial request for subsequent calls within the grace period.
2.  **Testing:** Add a regression test specifically covering concurrent submit scenarios to ensure no 500 errors occur under load.
3.  **Monitoring:** Implement a dashboard alert to notify the team immediately if the HTTP 500 error rate for checkout endpoints exceeds acceptable thresholds.
4.  **Verification:** Confirm that the fix resolves the 30% failure rate during rapid successive submissions.