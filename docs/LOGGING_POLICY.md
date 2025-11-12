PondPilot Logging Policy

Goals
- Do not log secrets or credentials under any circumstances.
- Minimize potentially sensitive data (SQL text, file paths) in production logs.
- Use structured logging with levels to aid troubleshooting in development without leaking data in release builds.

Policy
- Production (non-debug) builds:
  - Avoid logging raw SQL statements; if necessary, log length or hashes only.
  - Avoid logging file system paths unless essential; prefer redacted or canonicalized summaries.
  - Route logs through tracing with levels; default to WARN and ERROR.
  - Gate debug/trace logs behind cfg(debug_assertions) to exclude them from release builds.

- Development (debug) builds:
  - Allow debug/trace logs for troubleshooting.
  - Still avoid logging secrets and credentials; redact tokens and passwords.

Implementation Highlights
- Rust backend
  - Use tracing::{debug, info, warn, error} for structured logs.
  - Wrap verbose eprintln!/println! with cfg(debug_assertions).
  - Redact or summarize sensitive values (e.g., log SQL length instead of full SQL, only prefix for identifiers).

- Frontend
  - Use internal logger wrappers (where available) and avoid printing secrets to the console.

Configuration
- Default logging level:
  - Debug builds: DEBUG
  - Release builds: WARN
- Future work: expose environment variable or config to override levels for support builds.

