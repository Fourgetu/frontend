# Node edits and reset-date templates — 2026-10-13

Adapted from upstream frontend `c36bf6b8` and `06f2a35c`, preserving the custom dual-core profile selection.

Node edits submit only dirty fields plus the node UUID. Selecting profiles updates each slot's dirty state independently and does not discard edits to other fields. Explicit null, false, zero and empty arrays are preserved; undefined fields are omitted. The paired backend update recognizes changes and detachments of either core before deciding whether to apply runtime configuration.

The template variable help lists `LAST_TRAFFIC_RESET_AT`, `NEXT_TRAFFIC_RESET_AT_UNIX` and `NEXT_TRAFFIC_RESET_AT`. The backend counterpart implements these variables, including the custom monthly reset-day strategy. Date formatting can be specified with `{{NEXT_TRAFFIC_RESET_AT:format=YYYY-MM-DD}}`.

The npm backend contract dependency remains unchanged; these three template keys are added locally to the help list. This avoids pulling unrelated upstream Host-cloning contracts into this selected update. Deliver the frontend with the companion backend changes for consistent behavior.

Validation: 215 frontend unit tests passed, including four new payload regression cases. TypeScript, changed-file lint/format and the production Vite build passed. No live browser/VPS deployment was performed.
