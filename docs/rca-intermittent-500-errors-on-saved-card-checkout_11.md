# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow is experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (≤5 seconds). This affects approximately 3% of checkout attempts, resulting in direct revenue loss.

## Timeline
*   **Event:** Deployment of service version v2.3.
*   **Observation:** Monitoring indicates a spike in HTTP 500 errors specifically tied to the checkout endpoint.
*   **Reproduction:** Confirmed via manual testing: logging in, selecting a saved card, and submitting payment twice within 5 seconds triggers the 500 error on the second attempt ~30% of the time.

## Root Cause
The issue stems from a lack of proper idempotency handling in the payment processing logic introduced in v2.3. Specifically:
*   Concurrent payment submissions for the same transaction are not being deduplicated.
*   The system fails to honor idempotency keys when requests arrive in rapid succession, leading to race conditions that result in internal server errors (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Implement strict idempotency key validation in the payment service to ensure duplicate requests within the window are rejected or handled gracefully without raising 500 errors.
2.  **Testing:** Add regression tests that simulate concurrent submissions to verify idempotency behavior under load.
3.  **Monitoring:** Configure dashboard alerts to trigger on elevated HTTP 500 rates for the checkout endpoint to enable faster detection of future incidents.
4.  **Verification:** Confirm that the fix resolves the issue with zero 500s under concurrent submit scenarios.