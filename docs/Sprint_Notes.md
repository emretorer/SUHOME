# Sprint Notes

This file keeps sprint-level notes and decisions without duplicating README or API documentation.

## Current priorities
- Stabilize production startup (no runtime schema changes)
- Improve reliability of DB connectivity and error reporting
- Ensure SMTP configuration is consistent across environments

## Recent decisions
- Schema creation and migrations are handled outside runtime (Prisma/SQL only).
- App DB user (`suhome_app`) must keep DML-only permissions.

## Open questions
- Do we want a minimal health check endpoint (e.g., `/api/health`)?
- Should we formalize a versioned API contract (`/api/v1`)?

## Next sprint ideas
- Add real API examples with request/response in `docs/API_Documentation.md`
- Add architecture diagram to `docs/System_Architecture.md`
