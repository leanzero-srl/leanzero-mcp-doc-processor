# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary

Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue is triggered by rapid, concurrent payment submissions (submitting twice within 5 seconds), resulting in a ~30% failure rate for the second attempt. This impacts approximately 3% of all checkout attempts, directly affecting revenue.

## Timeline

*   **Release:** v2.3 deployed.
*   **Observation:** Post-deployment monitoring detects intermittent HTTP 500s on the payment endpoint.
*   **Reproduction:** Confirmed that logging in, adding a saved card, and submitting payment twice within a 5-second window reproduces the error ~30% of the time.
*   **Impact Assessment:** Estimated at ~3% of total checkout attempts failing.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. The system fails to honor idempotency keys when concurrent requests are received within a short time frame, leading to race conditions that result in HTTP 500 errors.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Ensure the payment endpoint strictly honors idempotency keys to prevent duplicate processing and race conditions.
2.  **Testing:** Add regression tests specifically targeting concurrent submissions to verify that no HTTP 500s occur under load.
3.  **Monitoring:** Implement a dashboard alert to monitor the HTTP 500 error rate for the checkout flow, enabling faster detection of similar issues in the future.
4.  **Validation:** Verify that the fix resolves the intermittent 500s during the submission window.