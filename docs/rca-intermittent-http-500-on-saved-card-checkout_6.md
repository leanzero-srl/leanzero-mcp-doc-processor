# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary

Following the release of v2.3, the saved-card checkout flow began experiencing intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a 500 error on the second attempt, leading to a ~3% failure rate for all checkout attempts. This is a revenue-impacting issue requiring immediate remediation.

## Timeline

*   **Release v2.3 Deployed:** Introduction of the regression.
*   **Incident Detected:** Monitoring/alerts indicate elevated HTTP 500 rates on the checkout endpoint.
*   **Reproduction Confirmed:** Engineering successfully reproduced the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
*   **Current Status:** Issue is actively impacting ~3% of checkout attempts.

## Root Cause

The root cause is identified as a **lack of proper idempotency handling** in the payment processing logic introduced in v2.3. Specifically:

*   The system does not adequately honor or check for existing idempotency keys on concurrent or near-concurrent payment submissions.
*   The race condition between the two rapid requests leads to a server-side exception (HTTP 500) rather than a graceful rejection or successful completion of the first request.

## Remediation

1.  **Immediate Fix:** Update the payment service to strictly enforce idempotency keys. Ensure that duplicate requests within the defined window return the result of the original request rather than throwing a 500 error.
2.  **Testing:** Add regression tests specifically covering concurrent/near-concurrent payment submissions to ensure the idempotency logic holds under load.
3.  **Monitoring:** Configure dashboard alerts to monitor the HTTP 500 rate on the checkout endpoint, triggering notifications if the rate exceeds acceptable thresholds.

### Acceptance Criteria

*   [ ] Idempotency keys are correctly honored for saved-card checkouts.
*   [ ] No HTTP 500 errors occur under concurrent submit scenarios.
*   [ ] Regression test suite includes cases for rapid double-submission.
*   [ ] Dashboard alerting is active for checkout 500 rates.