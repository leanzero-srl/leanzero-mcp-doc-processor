# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has experienced intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting ~3% of total checkout attempts and resulting in direct revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue first observed post-deployment.
*   **Reproduction**: Confirmed that logging in, adding a saved card, and submitting payment twice within 5 seconds triggers the 500 error on the second call.
*   **Impact Assessment**: Current failure rate is ~3% of all checkout attempts.

## Root Cause
The application fails to properly handle concurrent or near-concurrent payment submission requests for saved cards. Specifically, the backend does not strictly enforce idempotency for rapid duplicate requests, leading to race conditions that result in internal server errors (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Fix Idempotency Logic**: Ensure the payment service strictly honors idempotency keys. Duplicate requests within the grace period should return the result of the first request rather than attempting re-processing.
2.  **Eliminate 500 Errors**: Refactor the payment handler to gracefully handle concurrent submits without throwing internal server errors.
3.  **Add Regression Tests**: Implement automated tests that simulate concurrent payment submissions to verify idempotency handling.
4.  **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during the checkout flow to enable faster detection of future incidents.

**Acceptance Criteria:**
*   Idempotency keys are honored correctly.
*   No HTTP 500 errors occur under concurrent submit conditions.
*   Regression test coverage is added.
*   Dashboard alerting is active for checkout 500 rates.