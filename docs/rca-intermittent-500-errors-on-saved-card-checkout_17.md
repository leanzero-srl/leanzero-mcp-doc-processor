# RCA: Intermittent 500 Errors on Saved-Card Checkout

## Summary
Following the release of v2.3, the saved-card checkout process has been experiencing intermittent HTTP 500 errors. The issue manifests when a user submits a payment twice within a short timeframe (under 5 seconds). This results in a ~30% failure rate for the second request, affecting approximately 3% of all checkout attempts and causing direct revenue loss.

## Timeline
*   **Event Start**: Immediately following the deployment of release v2.3.
*   **Observation**: Monitoring detected increased 500 error rates on the checkout endpoint.
*   **Reproduction**: Confirmed that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact Assessment**: Quantified at ~3% of total checkout attempts failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced or exposed in v2.3. When two concurrent requests are submitted within a 5-second window, the system fails to recognize the second request as a duplicate, leading to a race condition that results in an HTTP 500 Internal Server Error.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix**: Implement strict idempotency key validation to ensure duplicate requests within the window are handled gracefully without throwing 500 errors.
2.  **Testing**: Add a regression test specifically targeting concurrent submit scenarios to ensure idempotency is maintained.
3.  **Monitoring**: Configure a dashboard alert to notify the team if the 500 error rate on the checkout endpoint exceeds a defined threshold.

**Acceptance Criteria:**
- Idempotency keys are honored correctly.
- No HTTP 500 errors occur under concurrent submit conditions.
- Regression tests are added and passing.
- Dashboard alerts are active for 500 rate spikes.