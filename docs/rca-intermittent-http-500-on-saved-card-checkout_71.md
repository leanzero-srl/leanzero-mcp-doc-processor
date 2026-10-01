# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow has been intermittently returning HTTP 500 errors. The issue affects approximately 3% of checkout attempts, resulting in direct revenue loss. The failure occurs specifically when a user submits payment twice within a 5-second window.

## Timeline

*   **Release v2.3 Deployed:** Issue began occurring post-deployment.
*   **Incident Detection:** Monitoring alerted on increased HTTP 500 rates for the `/checkout` endpoint.
*   **Reproduction:** Confirmed that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Current Status:** Under investigation; impact is ~3% of total checkout attempts.

## Root Cause

The root cause is identified as a **lack of idempotency handling** for concurrent payment submissions. The v2.3 release introduced changes that do not properly honor idempotency keys when multiple requests are sent in rapid succession. This leads to a race condition where the second request triggers a duplicate processing attempt, resulting in a server-side conflict and an HTTP 500 response.

## Remediation

1.  **Immediate Fix:** Enforce strict idempotency key validation to ensure duplicate requests are rejected with a 409 Conflict or handled gracefully without state mutation.
2.  **Code Review:** Audit other endpoints for similar race conditions.
3.  **Testing:** Add regression tests specifically covering concurrent submission scenarios within a 5-second window.
4.  **Monitoring:** Implement a dashboard alert for HTTP 500 rates on the checkout endpoint to enable faster detection of future regressions.
5.  **Verification:** Ensure that under concurrent submit conditions, no HTTP 500s occur and revenue integrity is maintained.