# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (~3 seconds), resulting in a failure rate of approximately 30% for the second request. This impacts ~3% of total checkout attempts, posing a direct risk to revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Issue Detected**: Users reported failed payments when rapidly submitting checkout forms.
*   **Reproduction Confirmed**: Internal testing identified that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Estimated 3% failure rate on checkout attempts; classified as revenue-affecting.

## Root Cause
The root cause is a lack of idempotency handling in the payment processing logic introduced in v2.3.
*   **Concurrency Conflict**: When two requests are submitted within a 5-second window, the system fails to honor idempotency keys.
*   **Race Condition**: Concurrent processing of identical payment intents leads to a state conflict, resulting in an HTTP 500 error rather than gracefully handling the duplicate request.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
1.  **Code Fix**: Implement strict idempotency key validation in the payment service to ensure duplicate requests within a short window return the original result instead of triggering an error.
2.  **Testing**: Add a regression test case that simulates concurrent payment submissions to verify idempotency handling.
3.  **Monitoring**: Configure a dashboard alert to trigger if the HTTP 500 rate for checkout endpoints exceeds acceptable thresholds.
4.  **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions during QA.