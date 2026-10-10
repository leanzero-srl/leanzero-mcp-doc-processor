# RCA: Saved-card checkout HTTP 500 errors

## Summary
Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue is triggered by rapid, concurrent submission of payment requests using a saved card, resulting in a ~30% failure rate for the second call when submitted within 5 seconds. This affects approximately 3% of all checkout attempts, posing a direct risk to revenue.

## Timeline
*   **Release v2.3 Deployed**: Introduction of the regression.
*   **Incident Detected**: Monitoring indicates increased HTTP 500 rates on the checkout endpoint.
*   **Reproduction Confirmed**: Engineers successfully reproduced the 500 error by submitting payment twice within a 5-second window.
*   **Impact Assessment**: Estimated 3% of checkout attempts are failing, impacting revenue.

## Root Cause
The root cause is a lack of proper idempotency handling in the payment processing logic introduced in v2.3. When a user submits a payment request twice in quick succession (concurrent requests), the system fails to recognize the second request as a duplicate. This race condition leads to a server-side error (HTTP 500) instead of returning the result of the first successful transaction or a proper duplicate rejection.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

*   **Fix Implementation**: Ensure the payment service strictly honors the `idempotency_key` header. Subsequent requests with the same key should return the original response without re-processing.
*   **Testing**: Add a regression test that simulates concurrent payment submissions to verify no HTTP 500 errors occur under load.
*   **Monitoring**: Configure a dashboard alert to trigger on spikes in the HTTP 500 rate for the checkout endpoint, enabling faster detection of future incidents.
*   **Acceptance Criteria Verification**:
    *   Idempotency key is honored.
    *   No HTTP 500s occur under concurrent submit conditions.
    *   Regression test is in place.
    *   Dashboard alert is active.