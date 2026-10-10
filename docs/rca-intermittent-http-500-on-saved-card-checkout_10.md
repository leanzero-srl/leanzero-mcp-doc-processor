# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, saved-card checkout has been experiencing intermittent HTTP 500 errors. The issue is triggered by rapid, concurrent payment submissions using a saved card. This results in approximately 3% of checkout attempts failing, leading to direct revenue loss.

## Timeline

| Time | Event |
| :--- | :--- |
| Post-v2.3 Release | Issue first observed; intermittent 500 errors reported. |
| Investigation | Reproduction confirmed: logging in, adding a saved card, and submitting payment twice within 5 seconds. |
| Analysis | Correlation identified between concurrent calls and the 500 error rate (~30% of double submits). |
| Current State | Impact estimated at ~3% of all checkout attempts failing. |

## Root Cause

The root cause is a lack of proper idempotency handling in the payment processing endpoint for saved cards. When two requests are submitted within a short window (5 seconds), the system fails to honor idempotency keys, leading to race conditions that result in HTTP 500 errors.

## Remediation

1.  **Code Fix**: Ensure the payment service strictly honors idempotency keys to prevent duplicate processing and race conditions.
2.  **Testing**: Add regression tests specifically targeting concurrent payment submissions to verify no 500 errors occur under load.
3.  **Monitoring**: Implement a dashboard alert for the HTTP 500 error rate on the checkout endpoint to enable faster detection of future incidents.
4.  **Verification**: Confirm that the fix resolves the issue with zero 500 errors during concurrent submit scenarios.