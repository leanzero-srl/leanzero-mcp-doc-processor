# RCA: Saved-card checkout HTTP 500

## Summary
Following the deployment of release v2.3, the saved-card checkout flow has experienced intermittent HTTP 500 errors. This issue occurs specifically when a user submits a payment twice within a 5-second window, affecting approximately 3% of checkout attempts and resulting in revenue loss.

## Timeline
- **Release v2.3 Deployed**: Introduction of changes affecting the payment processing pipeline.
- **Issue Detected**: Intermittent HTTP 500 errors observed during concurrent payment submissions.
- **Impact Assessment**: ~3% of checkout attempts failing; confirmed as revenue-affecting.
- **Current Status**: Investigation ongoing; remediation plan defined.

## Root Cause
The issue stems from a lack of idempotency handling for concurrent payment submissions. When a user submits a payment twice within a short timeframe (e.g., 5 seconds), the system fails to recognize the second request as a duplicate of the first, leading to a conflict that results in an HTTP 500 error in approximately 30% of such cases.

## Remediation
To resolve this issue and prevent recurrence, the following actions are required:

| Action Item | Description | Status |
| :--- | :--- | :--- |
| **Implement Idempotency Keys** | Ensure the payment service honors idempotency keys to handle duplicate requests gracefully. | Pending |
| **Fix Concurrent Submit Logic** | Update the checkout logic to prevent HTTP 500 errors under concurrent submission scenarios. | Pending |
| **Add Regression Test** | Create a test case that reproduces the double-submit scenario to prevent future regressions. | Pending |
| **Dashboard Alert** | Configure an alert on the dashboard to notify the team if the HTTP 500 rate exceeds acceptable thresholds. | Pending |