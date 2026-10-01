# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout process has been experiencing intermittent HTTP 500 errors. The issue specifically affects users attempting to submit payments twice within a short timeframe (5 seconds). This results in approximately 3% of checkout attempts failing, directly impacting revenue.

## Timeline
*   **Event**: Release of v2.3.
*   **Observation**: Intermittent HTTP 500 errors observed on saved-card checkout.
*   **Reproduction**: Log in, add a saved card, and submit payment twice within 5 seconds. The second call fails with a 500 error ~30% of the time.

## Root Cause
The root cause is identified as a lack of proper idempotency handling for concurrent payment submissions. When a second payment request is submitted rapidly after the first, the system fails to recognize it as a duplicate, leading to a server-side error instead of honoring the idempotency key or returning a success/already-processed status.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Ensure the idempotency key is strictly honored for saved-card checkout requests.
*   **Concurrency Control**: Implement safeguards to prevent HTTP 500 errors under concurrent submit conditions.
*   **Testing**: Add regression tests specifically covering concurrent payment submissions to ensure the fix holds.
*   **Monitoring**: Configure a dashboard alert to monitor the HTTP 500 rate for checkout attempts, enabling faster detection of future regressions.