# RCA: Intermittent HTTP 500 on Saved-Card Checkout (v2.3)

## Summary
Following the release of version 2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. This issue occurs specifically when a user submits a payment request twice within a 5-second window, affecting approximately 30% of such concurrent attempts. The incident has resulted in a ~3% failure rate for checkout attempts, directly impacting revenue.

## Timeline
* **Release v2.3**: Deployment introduces changes to the payment processing module.
* **Incident Detection**: Users report intermittent 500 errors during checkout.
* **Reproduction**: Engineering reproduces the issue by logging in, adding a saved card, and submitting payment twice within 5 seconds.
* **Impact Assessment**: Confirmed ~3% of checkout attempts fail; identified as revenue-affecting.

## Root Cause
The root cause is a lack of proper idempotency handling for concurrent payment submissions. When two payment requests are submitted within a short timeframe (5 seconds), the second request fails with an HTTP 500 error because the system does not correctly honor the idempotency key or handle the race condition, leading to an unhandled exception.

## Remediation
To resolve the issue and prevent recurrence, the following actions are required:

| Action | Description | Status |
| :--- | :--- | :--- |
| **Implement Idempotency** | Ensure the idempotency key is honored for concurrent requests to prevent duplicate processing or errors. | Pending |
| **Fix Concurrent Submit** | Update payment logic to handle concurrent submissions gracefully without returning 500 errors. | Pending |
| **Add Regression Test** | Create automated tests to verify behavior under concurrent submit scenarios. | Pending |
| **Dashboard Alert** | Configure a monitoring alert to trigger when the rate of 500 errors exceeds a defined threshold. | Pending |