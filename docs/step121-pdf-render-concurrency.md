# Step 121 — Bounded PDF render concurrency (merged and CI verified)

The API now permits one active Chromium PDF render per process. Concurrent PDF requests fail immediately with `503 REPORT_RENDER_BUSY` and `Retry-After: 1`; queued rendering is avoided because the PDF render currently runs inside a serializable database transaction. The render permit is released on both success and failure. This is a process-local limit, not a multi-replica global limit.

The cap is a resource-protection measure informed by the synthetic CI baseline in [Step 119](step119-report-pdf-resource-baseline.md), where a maximum-sized report measured 691.5 MiB summed process-tree RSS on one hosted Linux runner. That figure can double-count shared pages and does not establish capacity for any deployment. Define target-environment acceptance thresholds and measure sustained and concurrent load before production use.

Unit tests cover overlap rejection and permit release on success and failure. PR #46 merged as `89c0f748b4ce9fd16951ed90631ceb8cdb09e388`; exact-head CI [run 36392733080](https://github.com/atikas20152075/Ai-Writing/actions/runs/36392733080) passed backend integration, web portal, and desktop/mobile full-stack jobs. Production performance, multi-instance behavior, process isolation, and every other Step 92 release gate remain open. Production and real learner data remain **NO-GO**.
