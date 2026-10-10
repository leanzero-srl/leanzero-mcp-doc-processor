# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue affects approximately 3% of checkout attempts, occurring when a user submits payment twice within a 5-second window. This has resulted in revenue loss and requires immediate remediation to ensure idempotency and system stability.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression in payment processing logic.
*   **Incident Detected**: Monitoring alerts triggered for elevated HTTP 500 rates on the checkout endpoint.
*   **Reproduction Confirmed**: QA reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds. The second call fails ~30% of the time.
*   **Impact Assessment**: Confirmed that ~3% of total checkout attempts are failing, directly impacting revenue.

## Root Cause
The root cause is identified as a race condition in the payment processing handler introduced in v2.3. The system fails to properly handle concurrent requests for the same transaction when an idempotency key is not strictly enforced or validated before processing. Specifically, the second rapid-fire request bypasses the idempotency check or encounters a deadlock/timeout while the first request is still being processed, leading to a server-side exception (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Immediate Fix**: Enforce strict idempotency key validation. Ensure that duplicate requests within the same session/token window return the result of the original request rather than processing a new transaction or throwing an error.
2.  **Error Handling**: Update the payment service to gracefully handle concurrent submissions, ensuring no HTTP 500 errors are returned for valid retry attempts.
3.  **Testing**: Add a regression test case that simulates concurrent submissions (two calls within <5s) to verify idempotency and absence of 500 errors.
4.  **Monitoring**: Implement a dashboard alert for the HTTP 500 rate on the checkout endpoint to enable faster detection of future regressions.
5.  **Deployment**: Deploy the fix to staging for validation, then promote to production with monitoring enabled.