# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout process is experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This results in an overall failure rate of ~3% of checkout attempts, directly impacting revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Issue Detected**: Users reporting failed payments during high-intent checkout flows.
*   **Reproduction Confirmed**: Verified that dual submissions within a 5-second window trigger the 500 error in ~30% of cases.
*   **Impact Assessment**: Estimated ~3% of total checkout attempts are failing.

## Root Cause
The issue stems from a lack of proper idempotency handling in the payment processing logic introduced in v2.3. Concurrent or near-concurrent requests for the same transaction are not being deduplicated, leading to race conditions that result in server-side errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Enforce Idempotency**: Ensure the system strictly honors idempotency keys for payment submissions.
2.  **Fix Concurrency Logic**: Modify the backend logic to handle concurrent submit requests gracefully without throwing 500 errors.
3.  **Add Regression Tests**: Implement automated tests that simulate concurrent submissions to verify the fix.
4.  **Monitoring**: Configure dashboard alerts to monitor HTTP 500 rates specifically on the checkout endpoint to enable rapid detection of future regressions.