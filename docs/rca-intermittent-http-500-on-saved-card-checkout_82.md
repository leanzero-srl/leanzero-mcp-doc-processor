# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window; the second request fails approximately 30% of the time. This results in a ~3% failure rate for checkout attempts, directly impacting revenue.

## Timeline
*   **Release:** v2.3 deployed.
*   **Incident Start:** Immediately post-release, intermittent 500 errors observed on saved-card transactions.
*   **Reproduction:** Confirmed that submitting payment twice within 5 seconds triggers the 500 error on the second call ~30% of the time.
*   **Impact:** ~3% of all checkout attempts are failing.

## Root Cause
The system lacks proper idempotency handling for rapid, duplicate payment submissions. When two requests are submitted within a short timeframe (<5s), the second request is not correctly honored as a duplicate, leading to a server-side error (HTTP 500) instead of returning the result of the first successful transaction.

## Remediation
1.  **Code Fix:** Ensure idempotency keys are strictly honored. Duplicate requests with the same key must return the original response without processing again.
2.  **Testing:** Add regression tests to simulate concurrent/duplicate submissions within the 5-second window to prevent recurrence.
3.  **Monitoring:** Configure dashboard alerts to trigger on increased HTTP 500 rates during the checkout flow.
4.  **Verification:** Confirm no 500s occur under concurrent submit conditions in staging before production rollout.