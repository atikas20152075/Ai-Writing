# Step 106 — Teacher cohort analytics view (development)

Adds a teacher and academic-administrator summary card that consumes the existing scope-checked cohort analytics endpoint. The view groups current results by immutable rubric version and shows finalized coverage, represented learner count, mean, score range, and awaiting or unavailable result counts. Changing cohorts reloads the assessment list, review queue, and analytics; stale analytics requests are fenced.

## Interpretation and privacy

The panel repeats the API's limitations beside the data: results are assessment-weighted, repeated assessments count separately, and rubric versions are not comparable. It never shows learner or assessment identifiers. This remains an authorized staff view; it is not learner growth, mastery, or a causal measure. Small-cohort suppression and production data authorization remain open release decisions.

The synthetic portal browser fixture covers the display and mobile layout; the full-stack browser flow covers the actual NestJS/PostgreSQL endpoint. The analytics API remains the authorization and current-enrollment authority. PR #31 exact-head CI run [36357844849](https://github.com/atikas20152075/Ai-Writing/actions/runs/36357844849) passed all three jobs, including desktop/mobile browser coverage against both the synthetic portal service and actual NestJS/PostgreSQL. Production deployment and real learner data remain NO-GO under [Step 100](step100-production-readiness.md).
