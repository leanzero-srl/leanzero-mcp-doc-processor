# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue manifests when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a failure, affecting ~3% of total checkout attempts. This is a revenue-impacting issue requiring immediate remediation.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Monitoring shows increased HTTP 500 rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineers successfully reproduce the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status**: Active investigation; impact estimated at ~3% of checkout attempts failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3.
*   Concurrent or near-concurrent requests (submitted <5s apart) bypass existing safeguards.
*   The system fails to recognize the second request as a duplicate, leading to race conditions or state corruption that triggers a 500 Internal Server Error.

## Remediation & Acceptance Criteria
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Enforce Idempotency**: Ensure the `Idempotency-Key` header is strictly honored. Duplicate keys must return the original response without re-processing.
2.  **Fix Concurrency Handling**: Implement locking or atomic checks to prevent 500 errors under concurrent submit conditions.
3.  **Add Regression Tests**: Create automated tests that simulate rapid double-submissions to ensure the fix holds.
4.  **Monitoring & Alerts**: Configure dashboard alerts to trigger immediately if the HTTP 500 rate for the checkout endpoint exceeds baseline thresholds.

| Criterion | Status |
| :--- | :--- |
| Idempotency key honored | Pending |
| No 500s under concurrent submit | Pending |
| Regression test added | Pending |
| Dashboard alert on 500 rate | Pending |