# RCA: Saved-card checkout HTTP 500 after v2.3

## Summary
After the release of version 2.3, saved-card checkouts are returning HTTP 500 errors when a payment is submitted twice within a 5-second window. Approximately 3% of checkouts are failing due to this issue.

## Timeline
- **Release v2.3**: Deployment occurred; subsequent monitoring indicated an increase in checkout failures.
- **Incident Detection**: ~3% of saved-card checkouts began returning HTTP 500 errors.
- **Root Cause Identified**: Duplicate submissions within a short timeframe (≤5 seconds) trigger the error.

## Root Cause
The application lacks idempotency handling for payment submissions. When a user submits a payment twice rapidly, the system processes both requests as distinct transactions, leading to a conflict and resulting in an HTTP 500 Internal Server Error.

## Remediation
1. **Implement Idempotency Key**: Add support for idempotency keys on the checkout endpoint to ensure duplicate submissions are handled gracefully without causing errors.
2. **Add Regression Test**: Create automated tests that simulate rapid duplicate submissions to verify the fix and prevent future regressions.
3. **Dashboard Alert**: Configure a monitoring alert on the HTTP 500 error rate for saved-card checkouts to enable faster detection of similar issues in the future.