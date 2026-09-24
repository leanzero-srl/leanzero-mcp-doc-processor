# RCA: Intermittent HTTP 500 on Saved-Card Checkout

## Summary
Following the release of v2.3, saved-card checkout has exhibited intermittent HTTP 500 errors. The issue occurs when a user submits payment twice within a 5-second window. This results in approximately 3% of checkout attempts failing, leading to direct revenue impact.

## Timeline
*   **Release v2.3 Deployed:** Issue introduced.
*   **Incident Detected:** Users report failed transactions; monitoring confirms ~3% failure rate on saved-card checkouts.
*   **Reproduction Confirmed:** QA verified that submitting payment twice within 5 seconds triggers a 500 error ~30% of the time.

## Root Cause
The payment processing service lacks proper idempotency handling for rapid duplicate requests. When a second payment request is submitted within the 5-second window, the system fails to recognize it as a duplicate, leading to a race condition or state conflict that results in an unhandled server error (HTTP 500).

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

1.  **Code Fix:** Implement strict idempotency key validation in the payment service. Ensure that duplicate requests within the defined window are safely rejected or processed without side effects.
2.  **Testing:** Add regression tests specifically targeting concurrent/rapid-fire payment submissions to ensure no HTTP 500s are returned under load.
3.  **Monitoring:** Configure dashboard alerts to monitor HTTP 500 rates on the checkout endpoint, enabling faster detection of future regressions.
4.  **Acceptance Criteria Verification:**
    *   Idempotency keys are honored correctly.
    *   Zero HTTP 500 errors under concurrent submit conditions.
    *   Regression tests pass.
    *   Dashboard alert is active and functional.