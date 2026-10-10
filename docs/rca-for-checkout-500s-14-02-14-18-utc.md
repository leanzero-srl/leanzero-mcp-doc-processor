# RCA for Checkout 500s (14:02–14:18 UTC)

## Summary
At **14:02 UTC**, checkout began returning **HTTP 500** errors. The **error rate rose to 30%** and persisted for **11 minutes**. A rollback to **v412** restored service, and full recovery was achieved by **14:18 UTC**. Initial investigation suspected **database connection-pool exhaustion** introduced/triggered by a **new retry path**.

## Timeline
- **14:02 UTC** — Checkout started returning **500s**.
- **~14:02–14:13 UTC** — Error rate increased to **30%**.
- **~11 minutes** — Continued elevated error rate while investigation proceeded.
- **Rollback to v412** — Performed during mitigation to stop the regression.
- **14:18 UTC** — Service fully recovered.

## Root Cause
**Likely cause:** The **new retry logic** increased the number of concurrent database operations, leading to **database connection-pool exhaustion**. Once the pool was depleted, subsequent checkout requests failed, resulting in **500** responses.

## Remediation
- **Code fix:** Audit and adjust the retry path to prevent unbounded/compounding retries (e.g., add/correct retry limits, backoff, and circuit-breaking).
- **Resource controls:** Implement safeguards to cap concurrent DB usage per request and ensure retries do not amplify load.
- **DB pool tuning:** Review connection-pool sizing and timeouts relative to expected peak concurrency.
- **Observability:** Add/verify alerts for **DB pool saturation** (active connections, wait time, saturation thresholds) and correlate with checkout error rates.
- **Validation:** Re-test the checkout flow under load in staging to confirm retries no longer exhaust DB connections and that error rates remain within SLO/SLA.