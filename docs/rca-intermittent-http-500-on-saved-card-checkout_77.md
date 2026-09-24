# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window; the second request fails approximately 30% of the time. This results in roughly 3% of all checkout attempts failing, directly impacting revenue.

## Timeline
*   **Release v2.3 Deployed**: Service updated with new checkout logic.
*   **Issue Detected**: Monitoring alerts trigger on increased 500 error rates for the `/payment/submit` endpoint.
*   **Reproduction Confirmed**: QA confirms that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Current Status**: Investigation ongoing; hotfix being prepared to enforce idempotency.

## Root Cause
The root cause is identified as a **race condition in the payment processing logic** introduced in v2.3:
*   The system does not strictly enforce or validate idempotency keys for rapid, duplicate requests.
*   Concurrent submissions within a short timeframe (5s) cause the backend to attempt double-processing of the same transaction state, leading to a constraint violation or null pointer exception (HTTP 500).

## Remediation
1.  **Immediate Fix**: Enforce strict idempotency key validation on the payment submission endpoint to ensure duplicate requests are rejected or deduplicated safely.
2.  **Testing**: Add regression tests specifically covering concurrent submissions with identical idempotency keys within short time windows.
3.  **Monitoring**: Configure dashboard alerts to trigger on abnormal spikes in HTTP 500 rates for the checkout flow.
4.  **Verification**: Confirm that no HTTP 500 errors occur under load testing with concurrent submits.