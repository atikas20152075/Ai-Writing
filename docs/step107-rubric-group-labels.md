# Step 107 — Readable rubric group labels (development)

The cohort analytics API now returns the immutable rubric version number, writing type, and language with each already separated rubric group. The teacher portal uses these attributes to show labels such as “English paragraph · Rubric v1” and “Bangla paragraph · Rubric v1” instead of an opaque UUID prefix.

This is display metadata only: authorization, cohort scope, score calculations, grouping, and assessment weighting are unchanged. The endpoint still returns no learner or assessment identifiers. Production deployment and real learner data remain NO-GO under [Step 100](step100-production-readiness.md).
