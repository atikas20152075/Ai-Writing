# Step 120 — Accessible report download state (merged and CI verified)

Approved report downloads now announce preparation in the portal's existing polite status region, disable the active download button, and restore it after success or failure. Success and failure remain announced through the same status region; repeated clicks for the active report are ignored. Logging out or changing accounts clears the visible in-progress state.

The full-stack synthetic parent workflow now delays a valid PDF response to assert that progress is announced and the button is disabled, then injects a synthetic service failure and checks that the error is announced and the button becomes available again. No real learner records or content are used.

Local web TypeScript typecheck and `git diff --check` passed. PR #45 merged as `49b4c536fb2cb9b8b4f41cb453df6efd70b27468`; exact-head CI [run 36391388400](https://github.com/atikas20152075/Ai-Writing/actions/runs/36391388400) passed all three jobs, including desktop/mobile full-stack browser coverage. These checks establish UI state behavior only; they do not replace independent keyboard/screen-reader testing or production authorization review. Production remains **NO-GO**.
