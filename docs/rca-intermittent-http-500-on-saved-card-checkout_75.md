# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these duplicate submissions fail, resulting in a ~3% failure rate for all checkout attempts. This is a revenue-impacting issue requiring immediate remediation to ensure idempotency and system stability.

## Timeline

*   **Release v2.3 Deployed**: Introduction of changes affecting checkout logic.
*   **Incident Detected**: Monitoring alerts triggered on increased HTTP 500 rates for checkout endpoints.
*   **Reproduction**: Confirmed that submitting a saved-card payment twice within 5 seconds triggers the 500 error in ~30% of cases.
*   **Impact Assessment**: Estimated ~3% of total checkout attempts are failing due to this race condition.

## Root Cause

The root cause is identified as a **race condition in the payment processing logic** introduced in v2.3. The system fails to properly handle concurrent requests for the same transaction when an idempotency key is not strictly enforced or checked before processing. When two requests arrive within a short window, the second request attempts to process a transaction that may already be in a transitional state, leading to a server-side exception (HTTP 500).

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

*   **Enforce Idempotency**: Ensure the backend strictly honors the `idempotency-key` header. Duplicate requests with the same key must return the result of the original request rather than attempting re-processing.
*   **Fix Concurrency Handling**: Implement database-level locking or optimistic concurrency control to prevent race conditions during payment submission.
*   **Add Regression Tests**: Create automated tests that simulate concurrent submissions within a 5-second window to verify that no HTTP 500s occur.
*   **Implement Monitoring**: Add a dashboard alert for the checkout endpoint's 500 error rate to enable faster detection of similar issues in the future.
*   **Deploy Fix**: Release a hotfix patch addressing the concurrency bug and idempotency enforcement.

## Acceptance Criteria

*   [ ] Idempotency keys are correctly honored; duplicate requests return the original response.
*   [ ] No HTTP 500 errors occur under concurrent submit scenarios.
*   [ ] Regression test suite includes concurrent submission tests.
*   [ ] Dashboard alert is configured for checkout 500 error rates.