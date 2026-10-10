# RCA: HTTP 502 Intermittent Failures in Import/Export Flow (v2.3 Rollout)

## Summary

Intermittent HTTP 502 errors affecting ~6% of import/export requests emerged within 36 hours of the v2.3.0 rollout of payments-svc. The failure is triggered by a session-refresh race condition in the new pipeline, causing `validateSession()` to read an undefined token before the refresh middleware completes under load. The issue is reproducible with cached credentials in Firefox 125 and exhibits intermittent behavior (retries succeed ~60% of the time), allowing it to evade QA.

## Timeline

| Time | Event |
|------|-------|
| T+36h | v2.3.0 deployed to eu-west-1 with import/export-new-pipeline feature flag enabled |
| T+33h | On-call engineer observes spike in 5xx alerts in payments-svc |
| T+32h | Customer support tickets confirm intermittent import/export failures |
| T+0h | Root-cause analysis initiated |

## Root Cause

The v2.3 import/export pipeline introduced a session-refresh race condition:

1. **Race Condition Mechanism**: Under high load, the new pipeline attempts to validate the session token before the refresh middleware has completed writing the refreshed session state.
2. **Symptom**: `validateSession()` at `session.js:31` attempts to read `properties of undefined (reading 'token')`, producing a TypeError that surfaces as HTTP 502.
3. **Trigger Conditions**:
   - Requests using cached credentials (session already established)
   - Sustained or burst load that delays middleware execution relative to handler invocation
   - The race is intermittent (~6% failure rate), explaining why immediate retries often succeed (~60%).

**Evidence**:
- Stack trace points to `validateSession()` receiving a null/undefined token.
- Correlation with v2.3 rollout (36h window).
- Prior incidents in this area were mitigated by serializing refresh operations.
- Feature flag `import/export-new-pipeline = ON` isolates the affected code path.

## Remediation

### Immediate Actions
1. **Roll-Forward Fix** (preferred, behind existing feature flag):
   - Serialize session-refresh operations to prevent concurrent reads during refresh.
   - Add explicit null-check in `validateSession()` with a retry-with-backoff fallback.
   - Deploy as a patch (v2.3.1) behind the `import/export-new-pipeline` flag.

2. **Regression Test**:
   - Add test case that reproduces the race under simulated burst load with cached credentials.
   - Verify test fails on current v2.3.0 build and passes on patched version.

3. **Validation**:
   - Soak test at 2x peak traffic for 24 hours with no HTTP 502 errors from payments-svc.
   - Monitor correlation IDs and HAR captures for any residual failures.

### Long-Term Actions
- Document session-refresh serialization as a required pattern for future middleware changes.
- Enhance QA load-testing to simulate cached-credential scenarios with burst traffic.
- Review similar middleware interactions in other service versions.

## Acceptance Criteria

- ✓ No HTTP 502 from payments-svc for import/export flow over 24h soak at 2x peak load.
- ✓ Root cause documented with regression test that fails on v2.3.0 and passes on fix.
- ✓ Roll-forward fix deployed behind feature flag with tested rollback procedure.
- ✓ HAR captures and correlation IDs attached to ticket for validation.