# Step 120 — Accessible report download state (in progress)

Approved report downloads now announce preparation in the portal's existing polite status region, disable the active download button, and restore it after success or failure. Success and failure remain announced through the same status region; repeated clicks for the active report are ignored. Logging out or changing accounts clears the visible in-progress state.

The full-stack synthetic parent workflow now delays a valid PDF response to assert that progress is announced and the button is disabled, then injects a synthetic service failure and checks that the error is announced and the button becomes available again. No real learner records or content are used.

Local web TypeScript typecheck and `git diff --check` pass. Exact-head desktop/mobile full-stack CI must pass before this step is accepted. These checks establish UI state behavior only; they do not replace independent keyboard/screen-reader testing or production authorization review. Production remains **NO-GO**.
