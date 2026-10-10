# RCA: Saved-card checkout HTTP 500 errors

## Summary
Post-release v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors when a user submits payment twice within a short window (~3 seconds). This results in approximately 3% of checkout attempts failing, directly impacting revenue.

## Timeline
- **Release:** v2.3 deployed.
- **Incident Onset:** Immediately following release; intermittent 500s observed during high-frequency submissions.
- **Reproduction:** Logged in, added a saved card, and submitted payment twice within 5 seconds. The second call failed with HTTP 500 ~30% of the time.
- **Impact Assessment:** Estimated 3% failure rate on checkout attempts; flagged as revenue-affecting.

## Root Cause
The payment processing logic lacks proper idempotency handling for concurrent or near-concurrent requests. When a second payment request is submitted within 5 seconds of the first, the system fails to recognize it as a duplicate or race condition, leading to a server-side error (HTTP 500) rather than gracefully handling the duplicate submission.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:
- **Code Fix:** Implement and enforce idempotency keys for payment submissions to ensure duplicate requests are handled correctly.
- **Testing:** Add regression tests specifically targeting concurrent or rapid-fire payment submissions to ensure no HTTP 500s occur under these conditions.
- **Monitoring:** Configure dashboard alerts to notify the team if the HTTP 500 error rate for checkout endpoints exceeds a defined threshold.
- **Acceptance Criteria:**
  - Idempotency key is honored.
  - No HTTP 500 errors under concurrent submit scenarios.
  - Regression test coverage added.
  - Dashboard alerting enabled for checkout error rates.