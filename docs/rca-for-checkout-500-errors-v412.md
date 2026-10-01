# RCA for Checkout 500 Errors (v412)

## Summary
Starting at **14:02 UTC**, checkout began returning **HTTP 500** responses. The error rate rose to **~30%** and persisted for **11 minutes**. A rollback to **v412** restored service, with full recovery by **14:18 UTC**. Initial investigation pointed to **database connection-pool exhaustion** triggered by a change in the **new retry path**.

## Timeline
- **14:02 UTC**: Checkout started returning **500s**; error rate increases sharply.
- **14:02–14:13 UTC**: Error rate reaches **~30%** and remains elevated.
- **~14:13 UTC**: Suspected cause identified: **DB connection-pool exhaustion** related to the **new retry path**.
- **Rollback to v412**: Performed to mitigate the fault.
- **By 14:18 UTC**: Checkout recovered; error rate returns to normal.

## Root Cause
The incident was caused by **increased database connection consumption** under the **new retry behavior**, which likely led to **connection-pool exhaustion**. With the pool depleted, checkout requests failed and surfaced as **HTTP 500** until traffic and resource usage returned to an acceptable level after rollback.

## Remediation
- **Code/config changes**: Adjust retry logic (e.g., limit retries, add jitter/backoff, ensure retries do not amplify DB load).
- **Resource protections**: Enforce safer defaults for connection pooling (e.g., right-size pool, add timeouts/circuit breakers, prevent retry storms).
- **Observability**: Add/strengthen alerts and dashboards for:
  - DB connection pool utilization and wait time
  - request retry counts/rates
  - downstream failure rates leading to retries
- **Testing**: Add load/chaos tests covering retry scenarios to validate pool behavior under partial DB degradation.