# Step 108 — Small-cohort analytics suppression (development)

The scoped cohort analytics endpoint withholds all numeric counts and score aggregates for an immutable-rubric group unless at least five distinct learners have a current finalized result in that group. A suppressed group returns `suppressed: true` and null for every count and score field. The teacher portal displays a privacy notice instead of those values. Groups at the five-learner threshold retain the existing descriptive, assessment-weighted output.

The database integration test exercises both sides of the threshold, confirms no metrics leak for a one-learner group, and checks that a revision updates an eligible aggregate. Browser flows cover the withheld live cohort and a synthetic eligible group on desktop and mobile.

This minimum group size is a baseline safeguard, not complete de-identification: overlapping groups, repeated releases, outside knowledge, and other staff views may still permit inference. It does not authorize real learner data or close the privacy/legal review. Production remains NO-GO under [Step 100](step100-production-readiness.md).
