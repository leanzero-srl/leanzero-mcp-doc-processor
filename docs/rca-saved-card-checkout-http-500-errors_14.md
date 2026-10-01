# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary

Following the deployment of v2.3, the saved-card checkout flow experienced intermittent HTTP 500 errors. Specifically, submitting a payment twice within a 5-second window resulted in a ~30% failure rate on the second attempt. This issue impacts approximately 3% of all checkout attempts, resulting in direct revenue loss.

## Timeline

*   **Release:** v2.3 deployed.
*   **Incident Start:** Immediately post-deployment; intermittent 500 errors observed on saved-card checkouts.
*   **Reproduction:** Confirmed via automated and manual testing: logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status:** Active investigation; impact estimated at ~3% of total checkout attempts.

## Root Cause Analysis

The root cause is identified as a **lack of idempotency enforcement** in the payment processing layer introduced in v2.3.

*   The system does not currently honor idempotency keys for rapid duplicate requests.
*   Concurrent submissions (within the 5-second window) bypass existing safeguards, leading to race conditions that trigger server-side exceptions (HTTP 500).

## Remediation Plan

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Implement strict idempotency key validation in the payment service to ensure duplicate requests within the grace period return the original result rather than processing a new transaction.
2.  **Testing:**
    *   Add regression tests specifically targeting concurrent payment submissions.
    *   Verify that idempotency keys are correctly honored under load.
3.  **Monitoring:** Configure dashboard alerts to trigger when the HTTP 500 error rate exceeds acceptable thresholds during checkout operations.
4.  **Validation:** Confirm that no HTTP 500s occur under concurrent submit conditions in staging before promoting to production.