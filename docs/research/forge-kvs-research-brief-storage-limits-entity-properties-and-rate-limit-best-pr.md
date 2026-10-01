# Forge KVS Research Brief: Storage Limits, Entity Properties, and Rate-Limit Best Practices

# Forge KVS Research Brief: Storage Limits, Entity Properties, and Rate-Limit Best Practices

## Executive Summary

Atlassian Forge's Key-Value Store (KVS) and Custom Entity Store provide consumption-based storage with specific operational limits enforced per installation. Request sizes round to the nearest 10KB, batch operations are more efficient than individual writes, and developers can use product-level entity properties to avoid quota consumption. Rate limits apply at 12 MB/s for reads and 1 MB/s for writes per key, with custom entity queries subject to 1,000 read operations per 20 seconds.

---

## Key and Object Size Limits

| Constraint | Limit |
|---|---|
| **Key length** | 500 characters maximum |
| **Value size** | 240 KiB per object |
| **Object depth** | 31 levels maximum |
| **Read throughput** | 12 MB/s per key |
| **Write throughput** | 1 MB/s per key |
| **Query throughput** | 24 MB/s per index value |

**Key format requirements:**
- Must match regex: `/^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/`
- At least 1 character, cannot be empty or only whitespace
- Forge automatically prepends installation identifiers, so you do not need to include app or installation IDs

---

## Request Size Rounding and Batch Optimization

### Request Size Calculation
- Requests ≤10KB = **1 request unit**
- Requests 10–20KB = **2 request units**
- Requests are rounded up to nearest 10KB
  - Example: 65KB request rounds to 70KB = 7 request units

### Batch Operations Are More Efficient
- **Without batching:** 10 individual writes of 1KB each = 100KB of quota used
- **With batching:** 10 writes of 1KB each in a single batch operation = 10KB of quota used
- Batch operations and batch operations for custom entities significantly reduce quota consumption for multiple small writes

---

## Custom Entity Store Limits

### Entity Configuration
| Constraint | Limit |
|---|---|
| **Maximum entities per app** | 20 |
| **Maximum custom indexes per entity** | 7 |
| **Maximum attributes per entity** | 50 |
| **Entity object maximum size** | 240 KiB (raw) |
| **Entity object maximum depth** | 31 |
| **Maximum conditions per query** | 100 (where, andFilter, orFilter combined) |

### Entity Name Requirements
- Must only contain: `a-z0-9:-_`
- Must follow regex: `[_a-z0-9:-.]+`
- Cannot start with `-` or `_`
- Cannot begin or end with `.`
- Cannot contain `..` sequence
- Length: 3–60 characters
- Must be unique within app (no duplicates)

### Index Configuration
- **Index name characters:** `a-zA-Z0-9:-_.` only
- **Index name length:** 3–50 characters
- **Cannot start/end with `.`, cannot contain `..`**
- **Combined range attribute values:** max 900 bytes per index
- **Combined partition attribute values:** max 1,700 bytes per index
- **Maximum 7 custom indexes per entity**

---

## Rate Limits and Quotas

### Read and Write Operations
- **Read operations:** 1,000 per 20 seconds (custom entities)
- **Read throughput:** 12 MB/s per key
- **Write throughput:** 1 MB/s per key
- Each entity read counts as one read operation; unclear if multiple entities in a single query count as multiple operations

### Operation Limits Per Installation
If an installation exceeds limits during bulk processing (e.g., bulk issue updates), Atlassian recommends using the **Async events API** to queue storage interactions. Partners with data-heavy apps can contact Atlassian support for extended limits.

### Consumption-Based Pricing Model
- Effective January 1, 2026, Forge transitioned from quota-based to consumption-based pricing
- Hard quotas have been largely removed in favor of metered usage
- Strictly abusive or unstable usage patterns remain prohibited; Atlassian reserves the right to throttle or suspend apps

---

## Best Practices

### Storage Best Practices
1. **Use encrypted environment variables and `kvs.setSecret()`** for secrets and credentials
2. **Avoid unbounded data models** with entities that grow in depth or size without limits
3. **Avoid storing files** in Forge storage (Cloud backs up entire hosted storage for disaster recovery)
4. **Use batch operations** instead of individual writes to reduce quota consumption
5. **Use time-to-live (TTL) options** when appropriate (maximum 1 year; expired data deletion is asynchronous, up to 48 hours)

### Entity Properties for Free Storage
- **Store metadata directly against Jira issues** using product storage via entity properties (e.g., `/rest/api/3/issue/{issueId}/properties/my-app-data`)
- This approach uses product storage, **not Forge KVS quota**, and is free
- Example: Store processed status, timestamps, or other issue-linked metadata without consuming Forge quota

### Rate-Limit Handling
1. Implement **Async events API** for bulk operations to queue interactions with storage
2. Monitor throughput against per-key limits (12 MB/s read, 1 MB/s write)
3. For custom entities, respect 1,000 read operations per 20 seconds
4. Contact Atlassian support if consistent limit overages occur

---

## Transaction Limits

The KVS and Custom Entity Store support multiple operations packaged into transactions, subject to specific transaction-level limits (detailed in Atlassian's platform-quotas-and-limits documentation, referenced but not fully enumerated in available sources).

---

## Key References

- **KVS and Custom Entity Store limits:** [developer.atlassian.com/platform/forge/limits-kvs-ce](https://developer.atlassian.com/platform/forge/limits-kvs-ce/)
- **Platform quotas and limits:** [developer.atlassian.com/platform/forge/platform-quotas-and-limits](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/)
- **Storage API Reference (kvs.set):** [developer.atlassian.com/platform/forge/storage-reference/kvs-api](https://developer.atlassian.com/platform/forge/storage-reference/)
- **Queue app interactions with storage API:** [developer.atlassian.com/platform/forge/storage-api-limit-handling](https://developer.atlassian.com/platform/forge/storage-api-limit-handling/)
- **Optimize Forge Costs:** [developer.atlassian.com/platform/forge/optimise-forge-costs](https://developer.atlassian.com/platform/forge/optimise-forge-costs)