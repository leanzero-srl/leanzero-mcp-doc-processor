# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. This issue impacts approximately 3% of checkout attempts, resulting in direct revenue loss. The failure rate is significantly higher (~30%) when a user submits payment twice within a 5-second window.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Users report intermittent checkout failures.
*   **Reproduction Confirmed**: Validated that submitting payment twice within 5 seconds triggers the 500 error in ~30% of cases.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. Specifically:
1.  The system does not adequately honor or check existing idempotency keys for rapid, duplicate requests.
2.  Concurrent submissions within a short time window bypass existing safeguards, leading to a race condition that results in a server-side (HTTP 500) failure.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Code Fix**: Ensure the idempotency key is strictly honored; duplicate requests with the same key must return the original result rather than attempting re-processing.
*   **Testing**: Add regression tests specifically covering concurrent submissions to ensure no HTTP 500s occur under load.
*   **Monitoring**: Implement a dashboard alert to monitor the HTTP 500 rate for the checkout endpoint, enabling faster detection of similar issues in the future.