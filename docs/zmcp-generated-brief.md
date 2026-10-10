# ZMCP Generated Brief

## Problem

Forge Key-Value Store (KVS) has a 240 KiB storage limit per issue/entity, which may constrain data persistence for applications requiring larger datasets.

## Impact

- Applications storing structured data, configurations, or caches in Forge KVS may exceed capacity limits
- Risk of data loss or failed write operations when payloads approach or exceed the threshold
- Need for alternative storage strategies or data optimization for large-scale Forge apps

## Next Steps

- Verify the 240 KiB limit through external Atlassian Forge documentation
- Audit current Forge KVS usage patterns to identify at-risk applications
- Implement data compression, pagination, or alternative storage solutions (e.g., external databases)
- Document best practices and limits for development teams