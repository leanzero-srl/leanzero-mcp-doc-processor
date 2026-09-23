# RCA for checkout 500s incident (v412 rollback)

## Summary
- At **14:02 UTC**, **checkout** began returning **HTTP 500** responses.
- Error rate increased to **~30%** and sustained for **11 minutes**.
- Service was **recovered by 14:18 UTC** after **rolling back v412**.
- The working hypothesis was **database connection-pool exhaustion** triggered by a **new retry path** in the release.

## Timeline (UTC)
- **14:02** — Checkout started returning **500s**; error rate begins rising.
- **14:02–14:13** — Error rate reaches **~30%** and persists for approximately **11 minutes**.
- **14:13** — Rollback initiated (v412 identified as recent change).
- **14:13–14:18** — Post-rollback stabilization and continued monitoring.
- **14:18** — Checkout recovered; error rate returned to normal.

## Root Cause
- **Primary suspected cause:** **DB connection-pool exhaustion** caused by the **new retry logic** introduced in **v412**.
- As requests errored, the retry path likely increased concurrent DB usage, exhausting available connections and causing subsequent requests to fail with **500s** until the system stabilized.

## Remediation
- **Immediate (completed):** Roll back **v412**, restoring prior behavior.
- **Short-term prevention:*
  - Add/verify **connection-pool metrics and alerts** (e.g., active/queued connections, pool saturation time).
  - Ensure retry behavior has **bounded concurrency** (e.g., capped retries, backoff, and circuit-breaking) to avoid amplifying load during downstream failures.
  - Introduce **guardrails** to fail fast when the DB pool is saturated (return a controlled error rather than cascading to 500s).
- **Long-term fixes:**
  - Validate retry path against **load and failure-mode tests** (DB latency/connection exhaustion scenarios).
  - Rework retry implementation to reduce connection footprint (e.g., move retries outside connection-holding sections, ensure connections are promptly released).
  - Perform a **post-incident verification** by correlating v412 changes with DB pool utilization, thread/connection counts, and checkout error traces during **14:02–14:18**.