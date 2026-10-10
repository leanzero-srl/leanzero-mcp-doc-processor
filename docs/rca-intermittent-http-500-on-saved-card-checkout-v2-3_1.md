# RCA: Intermittent HTTP 500 on Saved-Card Checkout (v2.3)

## Summary
Following the release of v2.3, saved-card checkout experiences intermittent HTTP 500 errors. Specifically, when a user submits payment twice within a 5-second window, the second request fails approximately 30% of the time. This results in an overall failure rate of ~3% for checkout attempts, directly impacting revenue.

## Timeline
*   **Event**: Release of v2.3 deployed to production.
*   **Observation**: Monitoring detects increased HTTP 500 rates specifically on the payment submission endpoint.
*   **Reproduction**: Verified that submitting a saved-card payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Confirmed that approximately 3% of all checkout attempts are failing due to this issue.

## Root Cause
The root cause is a lack of idempotency handling in the payment processing logic introduced in v2.3. The system does not properly honor idempotency keys for rapid, duplicate requests submitted within a short time window (5s). This leads to race conditions where concurrent or near-concurrent requests attempt to process the same transaction simultaneously, resulting in server errors (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Idempotency Enforcement**: Ensure the payment service strictly honors idempotency keys. Duplicate requests with valid keys must return the result of the original request rather than attempting re-processing.
*   **Concurrency Control**: Implement safeguards to handle concurrent submissions without raising HTTP 500 errors.
*   **Testing**: Add regression tests that specifically simulate rapid, duplicate payment submissions to verify idempotency and stability.
*   **Monitoring**: Configure dashboard alerts to notify the team if the HTTP 500 rate on checkout endpoints exceeds acceptable thresholds.
*   **Acceptance Criteria**: 
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test coverage is added.
    *   Dashboard alerting on 500 rate is active.