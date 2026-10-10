# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary
Following the release of v2.3, saved-card checkout has experienced intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a short timeframe (5 seconds). Approximately 30% of these rapid double-submissions result in a 500 error, leading to an overall failure rate of ~3% of all checkout attempts. This is a revenue-affecting incident.

## Timeline
*   **Incident Start:** Immediately following deployment of release v2.3.
*   **Detection:** Monitoring identified elevated HTTP 500 rates correlated with checkout attempts.
*   **Reproduction:** Confirmed that submitting payment twice within 5 seconds triggers the error ~30% of the time.
*   **Impact:** ~3% of total checkout attempts are failing.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a second payment request is received within the 5-second window, the system fails to recognize it as a duplicate or handle the concurrency correctly, resulting in a server-side exception (HTTP 500) rather than rejecting the duplicate or processing it safely.

## Remediation Plan
1.  **Immediate Fix:** Implement strict idempotency key validation to ensure duplicate requests are honored without causing errors.
2.  **Verification:** Ensure no HTTP 500s occur under concurrent submit conditions.
3.  **Testing:** Add regression tests specifically covering rapid double-submission scenarios.
4.  **Monitoring:** Configure dashboard alerts to trigger on increased HTTP 500 rates during checkout to catch similar issues early.

### Acceptance Criteria
- [ ] Idempotency key is correctly honored.
- [ ] No HTTP 500 errors occur under concurrent submit conditions.
- [ ] Regression test added for this scenario.
- [ ] Dashboard alert configured for checkout 500 rate.