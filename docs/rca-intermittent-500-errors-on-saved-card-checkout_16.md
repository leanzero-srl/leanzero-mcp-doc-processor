# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary

Following the release of v2.3, customers using saved cards for checkout have experienced intermittent HTTP 500 errors. The issue occurs specifically when a user submits payment twice within a short timeframe (5 seconds). This bug affects approximately 3% of checkout attempts, resulting in direct revenue loss and a degraded user experience.

## Timeline

*   **Release v2.3 Deployed**: The regression was introduced in this release cycle.
*   **Incident Detected**: Monitoring alerts triggered due to elevated 500 error rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineers replicated the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds. The second call failed with a 500 status code ~30% of the time.
*   **Impact Assessment**: Estimated 3% failure rate on checkout attempts.

## Root Cause

The root cause is a lack of idempotency handling in the payment processing logic introduced in v2.3. When the second payment request is submitted rapidly after the first, the system fails to recognize it as a duplicate or concurrent attempt. Instead of honoring an idempotency key or queuing the request, the backend throws an unhandled exception, resulting in an HTTP 500 Internal Server Error.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation in the payment service. Ensure that concurrent submissions within the 5-second window are treated as duplicates of the first request.
2.  **Error Handling**: Ensure that duplicate requests return a `200 OK` (or appropriate success status) if the first request succeeded, rather than throwing a 500 error.
3.  **Testing**: Add a regression test that simulates concurrent payment submissions to verify idempotency behavior.
4.  **Monitoring**: Configure a dashboard alert to trigger when the 500 error rate on the checkout endpoint exceeds a defined threshold.

**Acceptance Criteria:**
*   Idempotency keys are honored correctly.
*   No HTTP 500 errors occur under concurrent submission conditions.
*   Regression test is added to the CI pipeline.
*   Dashboard alert is active for 500 rate monitoring.