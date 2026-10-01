# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (under 5 seconds). Approximately 30% of these rapid double-submissions result in a server error, impacting roughly 3% of total checkout attempts and affecting revenue.

## Timeline
*   **Release v2.3 Deployed**: Issue begins manifesting post-deployment.
*   **Reproduction Confirmed**: Developers successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Impact Assessment**: Analysis indicates ~30% failure rate on rapid double-submissions, translating to ~3% of all checkout attempts failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When a second payment request is received within 5 seconds of the first, the system fails to recognize it as a duplicate or concurrent request, leading to race conditions that trigger HTTP 500 errors.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
*   **Implement Idempotency Keys**: Ensure the payment service strictly honors idempotency keys to prevent duplicate processing.
*   **Fix Concurrent Submit Logic**: Refactor the payment handler to gracefully handle concurrent submissions without throwing 500 errors.
*   **Add Regression Tests**: Create automated tests that simulate rapid double-submissions to verify the fix.
*   **Monitor & Alert**: Configure dashboard alerts to notify on-call engineers if the HTTP 500 rate for checkout endpoints exceeds acceptable thresholds.