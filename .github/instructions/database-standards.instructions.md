---
description: "Use when working on database design, SQL migrations, schema changes, PostgreSQL tables, indexes, constraints, RBAC permissions, or auth/session persistence in ValtrimAPI. Enforce naming taxonomy, ID policy, normalization, and migration safety rules."
applyTo: "db/migrations/**/*.sql,scripts/run-migrations.js,src/config/database.js,src/services/auth.service.js,docs/database-schema-proposal.md"
---

# Database Standards - ValtrimAPI

## Objective
Apply consistent long-term database standards for all schema and migration work.
Design must remain understandable, evolvable, and safe over 10-30 years.

## Required naming taxonomy
Use snake_case and descriptive names. Do not use ambiguous abbreviations.

Table families:
- core_: domain entities
- sec_: security and authentication
- cat_: catalogs and master data
- rel_: association tables (N:M)
- ops_: business operation entities
- evt_: append-only event and audit tables

Examples in this project:
- core_users
- sec_auth_identities
- cat_roles
- rel_user_roles
- cat_permissions
- rel_role_permissions
- sec_user_sessions
- sec_session_refresh_tokens
- ops_projects
- evt_audit_log

## Primary key policy
Default policy:
- Use UUID primary keys for domain and operational tables.

Exception policy:
- For very high-volume append-only event tables, BIGINT identity is allowed.

Rules:
- Primary keys are immutable.
- Do not encode business meaning in PK values.
- If a public identifier is needed, add a separate public_id column.

## Normalization and modeling rules
- Target at least Third Normal Form (3NF).
- Separate identities/credentials from user profile data.
- Model many-to-many relations explicitly with rel_ tables.
- Store catalogs in cat_ tables, never hardcode in application logic.
- Use JSONB only for flexible metadata, not for core relational attributes.

## Column conventions
- Timestamps: created_at, updated_at.
- Boolean flags: is_active, is_email_verified, etc.
- Foreign keys: <referenced_table_singular>_id when possible and unambiguous.
- Use CITEXT for case-insensitive email uniqueness.
- Use INET for IP addresses.

## Constraint and index rules
Every new table must include:
- Primary key.
- Foreign keys where relationships exist.
- CHECK constraints for enumerated text states.
- UNIQUE constraints for natural uniqueness.
- Indexes for foreign keys and high-frequency query predicates.

Every auth/security table should include explicit anti-abuse constraints where applicable.

## Migration rules
- Never edit an already applied migration file.
- Add a new migration for every schema change.
- Keep migrations idempotent when possible.
- Prefer additive changes first, destructive changes in controlled follow-up migrations.
- Include seed updates in dedicated migration files.
- Validate migrations with npm run migrate and rerun to confirm idempotency.

## RBAC and fine-grained authorization rules
When implementing permissions:
- Define permission codes in cat_permissions.
- Map role-to-permission in rel_role_permissions.
- Route-level access control must use permissionsAll and/or permissionsAny.
- Avoid role-only checks inside controllers unless strictly needed.
- Keep permission codes stable and action-oriented (resource.action).

## Auth and session persistence rules
- Access token must be JWT with short TTL.
- Refresh tokens must be opaque random values.
- Persist only refresh token hashes, never plaintext tokens.
- Rotate refresh tokens on every refresh.
- Revoke sessions on refresh token reuse detection.
- Record sensitive auth actions in evt_audit_log.

## Security and secrets rules
- Never place real secrets in .env.example.
- Use environment variables for credentials and signing keys.
- Fail fast on missing critical auth configuration in runtime.

## Delivery checklist for DB-related tasks
Before completing any DB task, verify:
- Naming taxonomy is respected.
- PK/ID policy is respected.
- Constraints and indexes are complete.
- Migration is additive and versioned correctly.
- Seeder changes are idempotent.
- Authorization impact is evaluated when data model changes affect access.
