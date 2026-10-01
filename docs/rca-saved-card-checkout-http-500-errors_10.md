# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary
Following the release of v2.3, the saved-card checkout flow is intermittently returning HTTP 500 errors. The issue is triggered by rapid concurrent submissions (submitting payment twice within 5 seconds). Approximately 30% of these rapid dual-submissions fail, resulting in a ~3% overall failure rate for checkout attempts. This is a revenue-affecting issue.

## Timeline
*   **Release v2.3 Deployed**: Issue introduced.
*   **Reproduction Confirmed**: Logged in, added a saved card, and submitted payment twice within a 5-second window.
*   **Impact Observed**: Second call fails with HTTP 500 ~30% of the time.
*   **Current Status**: Active investigation; ~3% of total checkout attempts are failing.

## Root Cause
The system lacks proper idempotency handling for rapid, concurrent payment submissions. When a user submits payment twice within a short timeframe (5s), the backend does not correctly recognize the second request as a duplicate, leading to a conflict or race condition that results in an HTTP 500 error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Idempotency Key Enforcement**: Ensure the backend strictly honors idempotency keys to prevent duplicate processing.
*   **Concurrency Handling**: Implement logic to handle concurrent submits without throwing 500 errors.
*   **Testing**: Add a regression test specifically covering the scenario of rapid, concurrent payment submissions.
*   **Monitoring**: Configure a dashboard alert to trigger on elevated HTTP 500 rates during checkout flows.