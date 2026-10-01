# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been intermittently returning HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (≤5 seconds). Approximately 30% of these rapid double-submissions result in a failure, impacting roughly 3% of total checkout attempts and causing revenue loss.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced in production.
*   **Incident Detected**: Monitoring alerts triggered on increased HTTP 500 rates during checkout flows.
*   **Reproduction Confirmed**: Engineering reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: Estimated ~3% of checkout attempts are failing due to this race condition.

## Root Cause
The root cause is a **race condition** in the payment processing logic introduced in v2.3.
*   The system does not properly handle concurrent requests for the same transaction within a short window.
*   Idempotency keys are not being honored correctly when multiple requests arrive within 5 seconds of each other.
*   This leads to a state conflict, resulting in an HTTP 500 Internal Server Error on the second request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests within the window are rejected gracefully (e.g., HTTP 409 Conflict) rather than causing a server error.
*   **Testing**: Add regression tests specifically covering concurrent payment submissions to ensure the fix holds under load.
*   **Monitoring**: Configure dashboard alerts to trigger on elevated HTTP 500 rates during checkout operations.
*   **Acceptance Criteria**: 
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test suite includes the new scenario.