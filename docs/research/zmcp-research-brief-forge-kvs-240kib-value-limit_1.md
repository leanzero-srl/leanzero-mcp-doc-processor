# ZMCP Research Brief: Forge KVS 240KiB Value Limit

# ZMCP Research Brief: Forge KVS 240KiB Value Limit

## Executive Summary

Atlassian Forge's Key-Value Store (KVS) enforces a **240 KiB per-value size limit**. This constraint is a critical design boundary when using KVS as a mini-database, particularly for applications that store structured data like JSON arrays. The limit is documented in Atlassian's official platform limits guidance and represents a fixed operational constraint that does not scale with app usage.

---

## Problem Statement

**Core Issue:** Developers attempting to store large JSON arrays, complex objects, or bulk data in a single KVS value will encounter hard failures when payloads exceed 240 KiB.

**Impact Areas:**
- Applications using KVS as a de facto database for large records
- Features requiring atomic storage of multi-item collections
- Data migration scenarios involving batch operations
- Unaware teams discovering the limit after deployment

**Source:** Atlassian Developer Platform documentation identifies KVS and Custom Entity Store limits as a distinct category under "Platform limits" enforced to "ensure fair use and reliable performance" (https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/)

---

## Options

### Option 1: Chunk Large Values
**Approach:** Split payloads exceeding 240 KiB into multiple KVS entries with a naming convention (e.g., `key_part1`, `key_part2`).

**Pros:**
- Stays within Forge platform constraints
- No external storage dependency
- Relatively straightforward implementation

**Cons:**
- Requires custom serialization/deserialization logic
- Multi-part reads introduce eventual consistency risks
- Increased read/write frequency counts against API quotas

### Option 2: Migrate to Alternative Storage
**Approach:** Use Forge SQL, Forge Object Store, or Confluence Cloud REST API attachments for data exceeding 240 KiB.

**Pros:**
- Designed for larger payloads
- Better suited for structured queries (SQL option)
- Official Atlassian support for larger data volumes

**Cons:**
- Architectural change; increased complexity
- Different pricing tier (consumption-based)
- May require schema redesign

### Option 3: Compress Data Before Storage
**Approach:** Apply gzip or similar compression to values before storing in KVS; decompress on retrieval.

**Pros:**
- Maintains single-key simplicity
- Works transparently with existing KVS interface
- Can achieve 50–80% compression for typical JSON

**Cons:**
- CPU overhead on every read/write
- Compression ratio varies; not guaranteed under 240 KiB
- Adds latency to operations

### Option 4: Redesign Data Model
**Approach:** Normalize storage schema—store only essential metadata in KVS; reference larger objects via handle or identifier.

**Pros:**
- Enforces disciplined data design
- Reduces total KVS footprint
- Improves cache efficiency

**Cons:**
- Significant refactoring effort
- May not suit all use cases
- Requires careful versioning if deployed live

---

## Recommendation

**Primary:** **Implement chunking + compression (Options 1 + 3)** for near-term compliance.
- Encode large values with gzip before storage
- If compressed size still exceeds 240 KiB, implement chunked keys with a manifest entry
- Document the threshold and provide utility functions for serialization
- Monitor KVS usage via the Developer Console cost estimator to validate compression effectiveness

**Secondary (Medium Term):** **Evaluate Forge SQL or Object Store** if:
- Compression does not achieve sufficient size reduction (<240 KiB consistently)
- Query patterns require relational access
- Data volume justifies the architectural change

**Implementation Checklist:**
- [ ] Audit existing KVS keys for values approaching or exceeding 240 KiB
- [ ] Implement compression wrapper around KVS read/write functions
- [ ] Add unit tests covering boundary cases (239 KiB, 240 KiB, 241 KiB uncompressed)
- [ ] Document chunking scheme if needed (key naming, ordering, manifest format)
- [ ] Test failover logic for partial chunk loss
- [ ] Monitor storage cost dashboard post-deployment

**Reference:** Per Atlassian's platform limits documentation, KVS limits are "installation-level" and are "enforced to ensure fair use and reliable performance," with contact available for exceptional use cases (https://developer.atlassian.com/platform/forge/limits-kvs-ce/).