# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout process has been experiencing intermittent HTTP 500 errors. Specifically, when a user submits a payment twice within a 5-second window, the second request fails approximately 30% of the time. This issue impacts roughly 3% of all checkout attempts, resulting in significant revenue loss.

## Timeline

- **Release v2.3 Deployed**: Introduction of the regression.
- **Issue Detected**: Users report failed payments during high-frequency submission.
- **Current State**: ~3% of checkout attempts fail with HTTP 500.

## Root Cause

The root cause is identified as a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When concurrent or near-concurrent payment requests are submitted for the same saved card within a short timeframe (≤5s), the system fails to recognize the duplicate intent, leading to race conditions and subsequent HTTP 500 errors.

## Remediation

To resolve this issue and prevent recurrence, the following actions are required:

- **Immediate Fix**: Implement strict idempotency key validation to ensure duplicate payment requests are handled gracefully without throwing 500 errors.
- **Testing**: Add regression tests specifically targeting concurrent submit scenarios to verify idempotency.
- **Monitoring**: Configure dashboard alerts to monitor the HTTP 500 rate on the checkout endpoint, ensuring rapid detection of future anomalies.
- **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions during QA.