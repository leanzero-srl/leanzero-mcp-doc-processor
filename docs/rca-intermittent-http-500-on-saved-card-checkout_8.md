# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout process has experienced intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a short window (5 seconds). Approximately 30% of these rapid double-submissions result in a server error, affecting ~3% of total checkout attempts and impacting revenue.

## Timeline
- **Release**: Version v2.3 deployed.
- **Issue Detection**: Monitoring alerted on increased HTTP 500 rates during checkout.
- **Reproduction**: Confirmed that submitting a saved-card payment twice within 5 seconds triggers the error ~30% of the time.
- **Impact Assessment**: Estimated 3% failure rate on checkout attempts.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When concurrent or near-concurrent requests are submitted for the same transaction, the system fails to recognize the duplicate intent, leading to race conditions that result in HTTP 500 errors.

## Remediation
1. **Code Fix**: Ensure the payment service strictly honors the idempotency key, ignoring subsequent requests with the same key.
2. **Testing**: Add a regression test specifically covering concurrent submit scenarios to prevent future regressions.
3. **Monitoring**: Implement a dashboard alert to notify the team immediately if the HTTP 500 rate for checkout endpoints exceeds a defined threshold.
4. **Verification**: Confirm that no HTTP 500s occur under concurrent submit conditions in staging before re-deploying the fix.