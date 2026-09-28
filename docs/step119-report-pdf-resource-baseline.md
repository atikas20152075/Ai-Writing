# Step 119 — Synthetic PDF render resource baseline (in progress)

Adds a CI benchmark for three synthetic report sizes: a short English report, a typical five-factor Bangla report, and a maximum accepted Bangla report (20 factors with 20 evidence quotes each). Each case records render duration, PDF byte size, and peak RSS across the Node renderer process and its child processes. CI retains the JSON measurement artifact for 14 days.

The benchmark uses synthetic strings and renders cases sequentially. It is intended to expose regressions and provide a reproducible runner baseline. GitHub-hosted runner measurements are not production capacity limits: they do not represent the target deployment image, instance sizing, concurrent report traffic, worker queues, or sustained load. No production performance gate is closed by this measurement alone.

Local `node --check scripts/benchmark-report-pdf.mjs` and `git diff --check` pass. The synthetic render could not run in this workspace because Chromium is not installed; the exact-head CI job installs Chromium and must execute it. Record that run ID, artifact values, and any renderer failures here after validation. Keep performance/memory, concurrency, process-isolation, and production staging gates open until measured in the intended deployment environment against predeclared acceptance thresholds.
