# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the deployment of v2.3, the saved-card checkout flow began intermittently returning HTTP 500 errors. The issue specifically affects users attempting to submit payments twice within a short window (5 seconds). Approximately 3% of checkout attempts are failing, resulting in direct revenue impact. The root cause is identified as a lack of idempotency handling for concurrent payment submissions.

## Timeline

*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detection**: Monitoring alerts triggered by increased HTTP 500 rates on the checkout endpoint.
*   **Reproduction**: Engineers confirmed that submitting payment twice within 5 seconds triggers the 500 error ~30% of the time.
*   **Current Status**: Incident under investigation; remediation planned.

## Root Cause

The backend payment service does not properly handle concurrent requests for the same transaction. When a user submits a payment twice rapidly:

1.  Two parallel requests hit the payment processor.
2.  The system fails to recognize the duplicate intent due to missing or ignored idempotency keys.
3.  This race condition causes a state mismatch or constraint violation, resulting in an unhandled exception and an HTTP 500 response.

## Remediation

To resolve this issue, the following actions are required:

*   **Code Fix**: Implement strict idempotency key validation in the payment service to ensure duplicate submissions are rejected gracefully (e.g., HTTP 409 Conflict) rather than causing a server error.
*   **Testing**: Add a regression test that simulates concurrent submissions within a 5-second window to verify no 500 errors occur.
*   **Monitoring**: Configure a dashboard alert to notify on-call engineering if the HTTP 500 rate on the checkout endpoint exceeds defined thresholds.
*   **Acceptance Criteria**:
    *   Idempotency key is honored.
    *   No HTTP 500 errors under concurrent submit conditions.
    *   Regression test is present in the CI pipeline.
    *   Dashboard alert is active.