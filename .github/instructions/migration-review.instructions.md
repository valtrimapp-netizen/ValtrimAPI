---
description: "Use when reviewing SQL migrations, validating migration safety, auditing schema changes, or checking PostgreSQL migration quality in ValtrimAPI. Perform a strict migration review gate with findings and approval criteria."
applyTo: "db/migrations/**/*.sql,scripts/run-migrations.js"
---

# Migration Review Gate - ValtrimAPI

## Scope
This instruction applies only to migration review and migration safety checks.
It is not for designing new features. It is for validating migration correctness.

## Mandatory review outcome format
When reviewing migrations, always return:
1. Findings first, ordered by severity (critical, high, medium, low).
2. Each finding must include:
- impacted file
- exact issue
- risk/consequence
- recommended fix
3. If no findings exist, explicitly state: "No migration findings identified."
4. Include residual risks and testing gaps at the end.

## Hard fail rules (block migration approval)
Fail the migration review if any of these are true:
- Existing applied migration file was edited.
- Destructive operation is present without a safe phased plan.
- Missing primary key in a new table.
- Missing foreign key for declared relationship.
- Missing uniqueness constraint for natural keys that require it.
- Missing essential indexes on foreign keys and frequent filters.
- New auth/session sensitive data stored in plaintext where hashing is required.
- Real secret values appear in migration content or seed data.
- Seed logic is non-idempotent and can duplicate data.

## Safety checklist for every migration
Validate all items before approval:
- Versioning: file ordering is correct and monotonic.
- Idempotency: rerun does not duplicate objects or seed rows.
- Roll-forward safety: migration can be fixed by a new migration, not by editing history.
- Constraint quality: CHECK/UNIQUE/FK constraints match domain rules.
- Index quality: avoid missing indexes and redundant indexes.
- Lock impact: identify table rewrites/long locks and mention mitigation.
- Backfill safety: large updates are batched or planned to avoid downtime.
- Data integrity: no silent truncation, lossy casts, or uncontrolled defaults.

## Taxonomy and policy enforcement
Migration review must enforce project DB standards:
- Table taxonomy prefixes: core_, sec_, cat_, rel_, ops_, evt_.
- PK policy: UUID by default, BIGINT identity only for high-volume append-only event tables.
- Naming clarity: snake_case and descriptive names.
- 3NF consistency for relational entities.

## Authorization and security checks
If migration affects auth/RBAC/session model, ensure:
- Permission codes are in cat_permissions.
- Role mappings are in rel_role_permissions.
- Session/token persistence stores hashes, not plaintext secrets.
- Audit-sensitive actions remain traceable in evt_audit_log.

## Required runtime validation steps
For migration PRs/changes, require these checks:
1. Run npm run migrate once and confirm success.
2. Run npm run migrate a second time and confirm idempotent skip behavior.
3. Verify schema_migrations checksum tracking behavior is intact.

## Reviewer behavior
- Prefer precise, minimal feedback linked to concrete SQL lines.
- Do not approve with unresolved hard fail rules.
- If uncertain about production impact, mark as "needs staged rollout plan".
