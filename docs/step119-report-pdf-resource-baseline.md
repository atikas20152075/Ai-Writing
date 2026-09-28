# Step 119 — Synthetic PDF render resource baseline (CI verified)

Adds a CI benchmark for three synthetic report sizes: a short English report, a typical five-factor Bangla report, and a maximum accepted Bangla report (20 factors with 20 evidence quotes each). Each case records render duration, PDF byte size, and peak RSS across the Node renderer process and its child processes. CI retains the JSON measurement artifact for 14 days.

The benchmark uses synthetic strings and renders cases sequentially. It is intended to expose regressions and provide a reproducible runner baseline. GitHub-hosted runner measurements are not production capacity limits: they do not represent the target deployment image, instance sizing, concurrent report traffic, worker queues, or sustained load. No production performance gate is closed by this measurement alone.

Local `node --check scripts/benchmark-report-pdf.mjs`, API typecheck, and `git diff --check` pass. Exact-head candidate CI [run 36389557283](https://github.com/atikas20152075/Ai-Writing/actions/runs/36389557283) passed all three jobs. The backend generated and validated both bilingual PDFs, completed the resource benchmark, and passed the database/HTTP/Python checks. The full-stack browser and web portal jobs also passed. Its 14-day artifact reports Node v22.16.0 on Linux:

| Synthetic report | Render duration | PDF bytes | Peak summed process RSS |
|---|---:|---:|---:|
| Short English (1 factor, 1 quote) | 424.3 ms | 17,489 | 612.8 MiB |
| Typical Bangla (5 factors, 3 quotes each) | 375.6 ms | 41,924 | 622.6 MiB |
| Maximum Bangla (20 factors, 20 quotes each) | 1,107.5 ms | 273,153 | 691.5 MiB |

These are single sequential observations on a GitHub-hosted Linux runner, not latency percentiles. Summed per-process RSS may double-count shared pages. Keep performance/memory, concurrency, process-isolation, and production staging gates open until measured in the intended deployment environment against predeclared acceptance thresholds.
