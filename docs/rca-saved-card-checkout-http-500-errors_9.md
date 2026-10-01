# RCA: Saved-card checkout HTTP 500 errors

## Summary

Following the release of v2.3, the saved-card checkout flow intermittently returns HTTP 500 errors. The issue occurs when a user submits a payment twice within a 5-second window. Approximately 30% of these rapid double-submissions result in a 500 error, impacting ~3% of total checkout attempts and affecting revenue.

## Timeline

- **Release v2.3 Deployed**: Issue introduced.
- **Observation**: Users report intermittent payment failures during checkout.
- **Reproduction**: Logged in, added a saved card, and submitted payment twice within 5 seconds.
- **Impact Assessment**: Confirmed ~30% failure rate on rapid duplicate submissions; ~3% of all checkout attempts affected.

## Root Cause

The payment processing endpoint lacks proper idempotency handling for concurrent or near-concurrent requests. Specifically:

1. The system does not adequately honor idempotency keys when duplicate requests are received within a short timeframe (<5s).
2. Race conditions in the transaction state management lead to unexpected server errors (HTTP 500) when the second request attempts to process a transaction that is already being handled or has just completed.

## Remediation

- **Immediate**: Ensure the idempotency key mechanism is strictly honored to reject or queue duplicate requests.
- **Short-term**: Implement logic to prevent HTTP 500s under concurrent submit scenarios (e.g., return 409 Conflict or 202 Accepted with status polling).
- **Testing**: Add regression tests covering concurrent/rapid duplicate payment submissions.
- **Monitoring**: Configure dashboard alerts for spikes in the HTTP 500 rate during checkout flows.
- **Verification**: Confirm that no 500s occur under load testing with rapid duplicate submissions.