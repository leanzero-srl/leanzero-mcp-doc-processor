# ZMCP Generated Brief: Forge KVS Storage Limitation

## Problem
Forge Key-Value Store (KVS) has a 240 KiB storage limit per app installation. This constraint may restrict the amount of data that can be persisted in Forge applications.

## Impact
- Applications cannot store data payloads exceeding 240 KiB
- Larger datasets require external storage solutions or data partitioning strategies
- Feature development may be constrained by this storage ceiling

## Next Steps
- Verify the 240 KiB limit externally against current Forge documentation
- Assess current and projected data storage needs for affected applications
- Evaluate alternatives: external databases, chunking strategies, or cloud storage integration
- Document storage requirements and implement appropriate architecture