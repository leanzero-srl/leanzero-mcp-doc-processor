# RCA: Saved-Card Checkout HTTP 500 Errors

## Summary
Following the release of v2.3, saved-card checkout intermittently returns HTTP 500 errors. This affects approximately 3% of checkout attempts, resulting in significant revenue impact. The issue is triggered by rapid consecutive payment submissions.

## Timeline
* **Release:** v2.3 deployed.
* **Incident Start:** Immediate post-release; intermittent 500 errors observed during saved-card transactions.
* **Reproduction:** Verified that submitting payment twice within a 5-second window triggers the error ~30% of the time.

## Root Cause
The root cause is a lack of idempotency handling for rapid, concurrent payment submissions. When a user submits a saved-card payment twice within 5 seconds:
1. The first request processes successfully.
2. The second request, arriving before the first completes or without proper idempotency key validation, causes a server-side conflict or state error, resulting in an HTTP 500.

## Remediation
* **Immediate Fix:** Ensure idempotency keys are strictly honored to prevent duplicate processing.
* **Code Change:** Implement logic to handle concurrent submits without throwing 500 errors.
* **Testing:** Add regression tests specifically covering concurrent submission scenarios.
* **Monitoring:** Configure dashboard alerts to notify on spikes in the 500 error rate during checkout.
* **Acceptance Criteria:**
  - Idempotency key honored.
  - No 500s under concurrent submit.
  - Regression test added.
  - Dashboard alert on the 500 rate.