# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow has been experiencing intermittent HTTP 500 errors. The issue specifically affects users submitting payments twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a 500 error, leading to an overall failure rate of ~3% of all checkout attempts. This is a revenue-affecting incident requiring immediate remediation.

## Timeline

| Time (UTC) | Event |
| :--- | :--- |
| Post-v2.3 Release | Issue first observed in production logs |
| Discovery | Reproduced locally: logging in, adding a saved card, and submitting payment twice within 5s triggers the error |
| Current Status | Impacting ~3% of checkout attempts |

## Root Cause
The root cause is identified as a **race condition** in the payment processing logic introduced in v2.3. The system does not properly handle concurrent requests for the same transaction context within a short timeframe (5s). The second request fails to validate or serialize correctly against the first, resulting in a server-side exception (HTTP 500) rather than gracefully rejecting the duplicate or completing the transaction idempotently.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Enforce Idempotency**: Ensure the payment service strictly honors idempotency keys. Duplicate requests within the defined window should return the result of the original request rather than failing.
2.  **Concurrency Handling**: Implement server-side locking or queueing to prevent concurrent submissions for the same user/transaction context from causing 500 errors.
3.  **Regression Testing**: Add automated tests specifically targeting rapid double-submissions (within 5s) to ensure idempotency and stability under concurrent load.
4.  **Monitoring & Alerting**: Configure dashboard alerts to notify the team immediately if the HTTP 500 rate for the checkout endpoint exceeds the baseline threshold.