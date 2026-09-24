# ZMCP Research Brief: Forge KVS 240KiB Value Limit

## Summary

Atlassian Forge's Key-Value Store (KVS) enforces a **240 KiB per-value size limit**. This is a hard operational constraint designed to ensure fair use and reliable platform performance. Developers treating KVS as a mini-database must architect storage carefully to respect this boundary, particularly when storing structured data like JSON arrays.

## Problem

- **Hard Size Constraint**: The 240 KiB limit is a platform-level enforcement that cannot be negotiated or exceeded without architectural redesign
- **JSON Storage Risk**: Storing large JSON arrays or complex nested objects in a single KVS value can easily breach this threshold
- **No Automatic Scaling**: Unlike consumption-based pricing (effective January 1, 2026), the 240 KiB limit remains fixed and does not scale with app usage or payment tier
- **Silent Failures**: Developers may encounter unexpected write failures or truncation if value sizes exceed the limit without prior validation

## Options

| Approach | Details | Trade-offs |
|----------|---------|------------|
| **Value Sharding** | Split large objects across multiple KVS keys with a naming convention (e.g., `object-1`, `object-2`) | Requires additional read/write logic; increased operation count |
| **Compression** | Gzip or other compression before storage; decompress on retrieval | Adds CPU overhead; maintains single-key simplicity |
| **Forge SQL or Object Store** | Migrate to Forge SQL (relational) or Forge Object Store (larger objects) for workloads exceeding 240 KiB | Different API; potential cost implications; suitable for persistent data |
| **Pagination/Streaming** | Design APIs to return data in chunks smaller than 240 KiB | Requires client-side reassembly; better for large datasets |
| **Selective Storage** | Store only critical fields in KVS; move auxiliary data to external systems | Introduces external dependencies; complexity |

## Recommendation

1. **Validate Early**: Implement pre-write size checks to detect oversized payloads before attempting KVS operations
2. **Architect for Scale**: Default to value sharding or compression for any JSON payload approaching 100+ KiB to maintain safety margins
3. **Evaluate Alternatives**: If data consistently exceeds 240 KiB, evaluate Forge SQL or Forge Object Store—the 240 KiB limit indicates KVS is not the appropriate storage tier
4. **Document Limits**: Clearly document the 240 KiB constraint in app design documentation and provide user-facing error messages if limits are approached
5. **Monitor Usage**: Use the Forge Developer Console's usage dashboard to track KVS operation patterns and proactively identify problematic payloads

## Reference

- **Source**: Atlassian Developer Platform — [KVS and Custom Entity Store limits](https://developer.atlassian.com/platform/forge/limits-kvs-ce/)
- **Operational Scope**: Installation-level limit; enforced for all Forge apps
- **Pricing Model**: Limit remains in effect under Forge's consumption-based pricing model (effective January 1, 2026)