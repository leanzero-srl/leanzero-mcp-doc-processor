# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout process is intermittently returning HTTP 500 errors. The issue affects approximately 3% of checkout attempts, specifically when a user submits a payment twice within a 5-second window. This results in revenue loss and requires immediate remediation to ensure idempotency and system stability.

## Timeline

*   **Release:** v2.3 deployed.
*   **Observation:** Users report intermittent checkout failures (HTTP 500).
*   **Reproduction:** Identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment:** ~3% of total checkout attempts are failing.

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a second request is received within the 5-second window, the system fails to recognize the duplicate intent, leading to a race condition or state conflict that results in an HTTP 500 error rather than gracefully handling the duplicate request.

## Remediation Plan

To resolve this issue and prevent recurrence, the following actions are required:

*   **Code Fix:** Implement strict idempotency key validation to ensure duplicate submission requests are honored without causing server errors.
*   **Testing:** Add a regression test case that simulates concurrent submit requests (within 5s) to verify no HTTP 500s occur.
*   **Monitoring:** Configure dashboard alerts to trigger on elevated HTTP 500 rates during checkout flows to enable faster detection of future incidents.
*   **Verification:** Confirm that the fix resolves the ~3% failure rate and that the acceptance criteria are met.