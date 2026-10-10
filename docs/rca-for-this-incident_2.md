# RCA for this incident

## Summary
The export service crashed at 02:00 and was restarted at 02:40.

## Root Cause
Temporary files filled the disk, leaving insufficient space for the service to run.

## Remediation
The service was restarted at 02:40. To prevent recurrence, add temporary-file cleanup and disk-space monitoring with alerts.