# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow is experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a 5-second window. Approximately 30% of these duplicate submission attempts result in a 500 error, impacting roughly 3% of total checkout attempts and resulting in revenue loss.

## Timeline
*   **Release:** v2.3 deployed.
*   **Incident Start:** Immediately post-deployment; intermittent 500s observed on saved-card payments.
*   **Reproduction:** Confirmed that submitting payment twice within 5 seconds triggers the failure ~30% of the time.
*   **Impact Assessment:** Estimated 3% of all checkout attempts are failing.

## Root Cause
The system lacks proper idempotency handling for rapid, duplicate payment submissions. When a second payment request is received within the 5-second window, the backend fails to recognize the duplicate intent and attempts to process the transaction again, leading to a race condition or state conflict that results in an HTTP 500 error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Implement Idempotency Keys:** Ensure the backend honors idempotency keys for payment submissions. Duplicate requests with the same key should return the original response rather than attempting re-processing.
2.  **Fix Concurrency Handling:** Update payment logic to safely handle concurrent submits without throwing 500 errors.
3.  **Add Regression Tests:** Create automated tests specifically covering rapid duplicate submission scenarios to ensure the fix holds under load.
4.  **Monitoring & Alerts:** Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for the checkout endpoint exceeds a defined threshold.

**Acceptance Criteria:**
*   Idempotency keys are honored.
*   No HTTP 500 errors occur under concurrent submit conditions.
*   Regression test added and passing.
*   Dashboard alert configured for 500 rate spikes.