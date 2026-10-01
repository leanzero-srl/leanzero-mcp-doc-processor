# RCA for checkout incident

## Summary

- The checkout service experienced a significant outage, returning 500 errors at a rate of 30% for 11 minutes.
- The incident was resolved by rolling back to version v410.
- The suspected cause is DB connection-pool exhaustion under the new retry path introduced in v412.

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 14:02      | Checkout service starts returning 500 errors. |
| 14:07      | Error rate reaches 30%. |
| 14:13      | Decision made to roll back to v410. |
| 14:18      | Service recovers after rollback. |

## Root Cause

- The introduction of a new retry path in version v412 likely led to an exhaustion of the DB connection pool.
- This exhaustion caused the checkout service to fail, resulting in the observed 500 errors.

## Remediation

- Immediate: Roll back to a stable version (v410) to restore service.
- Long-term: Investigate and optimize the DB connection pool management in the new retry path. Consider implementing connection pooling limits and monitoring to prevent future exhaustion.