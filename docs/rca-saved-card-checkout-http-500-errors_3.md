# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary
Following the release of v2.3, the saved-card checkout flow is intermittently returning HTTP 500 errors. This occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in failure, impacting ~3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Event:** Release of version v2.3 deployed.
*   **Observation:** Intermittent HTTP 500 errors detected in saved-card checkout flow.
*   **Reproduction:** Logged in, added a saved card, and submitted payment twice within 5 seconds.
*   **Impact:** ~30% failure rate on rapid double-submissions; ~3% of total checkout attempts affected.

## Root Cause
The issue stems from a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When two payment requests are sent in rapid succession (within 5 seconds), the system fails to recognize the second request as a duplicate of the first, leading to a race condition or state conflict that triggers an internal server error (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Enforce Idempotency:** Ensure the payment service strictly honors idempotency keys. Duplicate requests with the same key must return the original success response rather than processing a new transaction or throwing an error.
2.  **Fix Concurrency Logic:** Update the backend logic to handle concurrent submit requests gracefully, ensuring no HTTP 500s occur under load.
3.  **Add Regression Tests:** Implement automated tests that simulate rapid double-submissions to verify the fix.
4.  **Monitoring:** Configure dashboard alerts to trigger on elevated HTTP 500 rates for the checkout endpoint to enable faster detection of future regressions.