# Propuesta inicial de schema (PostgreSQL)

## Objetivo

Definir una base de datos inicial en 3FN, con convenciones consistentes y soporte para:

- Login local
- Login con Google
- Persistencia de sesiones con refresh token
- JWT access token para peticiones
- Roles base (admin, normal)
- Control de estado de usuario (active)
- Trazabilidad por auditoria

## Convenciones recomendadas

- snake_case para tablas y columnas
- tablas en plural
- claves primarias UUID (id)
- foraneas como nombre_tabla_id
- timestamps: created_at, updated_at
- borrado logico opcional con deleted_at (si aplica)
- valores booleanos con prefijo is_(is_active, is_verified)
- indices en llaves foraneas y campos de consulta frecuente
- constraints para integridad (UNIQUE, CHECK, FK)

## Convencion de nombres por tipo de tabla

Objetivo: que el nombre revele su funcion sin abrir el schema.

Prefijos recomendados:

- core_: entidades principales del dominio
- sec_: seguridad y autenticacion
- cat_: catalogos/maestros estables
- rel_: tablas de asociacion N:M
- evt_: eventos y bitacoras append-only
- ops_: operaciones de negocio

Plantilla:

- <prefijo>_<sustantivo_plural_descriptivo>

Nombres fisicos recomendados para este proyecto:

- core_users (antes: users)
- sec_auth_identities (antes: auth_identities)
- cat_roles (antes: roles)
- rel_user_roles (antes: user_roles)
- sec_user_sessions (antes: user_sessions)
- sec_session_refresh_tokens (nueva, para rotacion de refresh token)
- ops_projects (antes: projects)
- evt_audit_log (antes: audit_log)

Reglas practicas:

- evitar abreviaturas ambiguas (usr, prj, cfg)
- mantener singular/plural consistente por familia (preferido: plural para entidades)
- no usar nombres de negocio temporales o de UI
- no renombrar por moda; la estabilidad del nombre gana en 10-30 anos

## Politica de IDs (horizonte 10-30 anos)

- Estandar por defecto: UUIDv7 para todas las entidades de dominio y tablas operativas.
- Excepcion intencional: tablas de auditoria/eventos de alto volumen pueden usar BIGINT identity para orden natural de escritura.
- Para catalogos pequenos (como roles), priorizar consistencia del ecosistema: usar UUID tambien evita migraciones futuras cuando el catalogo crece o se integra con otros sistemas.

Razon:

- Evita colisiones entre entornos y entre sistemas distribuidos.
- Facilita merges de datos historicos, multi-tenant y federacion futura.
- UUIDv7 mejora localidad de indices frente a UUIDv4 (mejor performance en insercion a largo plazo).

## Modelo propuesto (fase inicial)

### users

Entidad principal del usuario (sin acoplar credenciales de proveedor)

- id UUID PK
- email TEXT NOT NULL
- full_name TEXT NOT NULL
- is_active BOOLEAN NOT NULL DEFAULT true
- is_email_verified BOOLEAN NOT NULL DEFAULT false
- last_login_at TIMESTAMPTZ NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Restricciones:

- UNIQUE(email)

### auth_identities

Metodo de autenticacion por usuario (normaliza login local vs Google)

- id UUID PK
- user_id UUID NOT NULL FK -> users(id)
- provider TEXT NOT NULL
- provider_subject TEXT NULL
- password_hash TEXT NULL
- is_primary BOOLEAN NOT NULL DEFAULT false
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Reglas:

- provider permitido: local, google
- local requiere password_hash y no requiere provider_subject
- google requiere provider_subject y no requiere password_hash

Restricciones:

- UNIQUE(provider, provider_subject) cuando provider_subject no es null
- UNIQUE(user_id, provider)

### roles

Catalogo de roles

- id UUID PK
- code TEXT NOT NULL UNIQUE
- name TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Semillas iniciales:

- admin
- normal

### user_roles

Relacion N:M entre usuario y roles

- user_id UUID NOT NULL FK -> users(id)
- role_id UUID NOT NULL FK -> roles(id)
- assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
- assigned_by_user_id UUID NULL FK -> users(id)

PK compuesta:

- (user_id, role_id)

### user_sessions

Sesion persistida por dispositivo/cliente

- id UUID PK
- user_id UUID NOT NULL FK -> users(id)
- session_key_hash TEXT NOT NULL
- refresh_token_hash TEXT NOT NULL
- device_name TEXT NULL
- ip_address INET NULL
- user_agent TEXT NULL
- last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
- expires_at TIMESTAMPTZ NOT NULL
- revoked_at TIMESTAMPTZ NULL
- revoked_reason TEXT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Restricciones:

- UNIQUE(session_key_hash)
- UNIQUE(refresh_token_hash)

Indices:

- (user_id)
- (expires_at)
- (revoked_at)

### projects

Proyecto de negocio

- id UUID PK
- owner_user_id UUID NOT NULL FK -> users(id)
- name TEXT NOT NULL
- description TEXT NULL
- status TEXT NOT NULL DEFAULT active
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

Reglas:

- CHECK(status IN ('active', 'archived'))

Indices:

- (owner_user_id)
- (status)

### audit_log

Bitacora de acciones sensibles

- id BIGSERIAL PK
- actor_user_id UUID NULL FK -> users(id)
- action TEXT NOT NULL
- entity_type TEXT NOT NULL
- entity_id TEXT NULL
- metadata JSONB NOT NULL DEFAULT '{}'::jsonb
- ip_address INET NULL
- user_agent TEXT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Indices:

- (actor_user_id)
- (entity_type, entity_id)
- (created_at)

## Estrategia JWT + refresh token (recomendada)

1. Login exitoso:

- emitir access_token JWT corto (ej. 15 min)
- emitir refresh_token opaco largo (ej. 30 dias)
- guardar solo hash de refresh_token en user_sessions

1. Peticiones autenticadas:

- enviar Authorization: Bearer <access_token>
- validar firma, exp, iss, aud, sub y jti

1. Refresh automatico:

- si access_token expira, el cliente llama /auth/refresh con refresh_token
- validar hash, estado de sesion y expiracion
- rotar refresh_token (invalidar anterior y guardar nuevo hash)
- emitir nuevo access_token

1. Logout:

- revocar sesion actual (revoked_at)
- opcion de logout global: revocar todas las sesiones activas del usuario

1. Reuso detectado de refresh token:

- revocar todas las sesiones del usuario (o al menos del dispositivo) por seguridad
- registrar evento en audit_log

## Razon de diseno (3FN)

- users contiene solo atributos del usuario
- auth_identities separa credenciales/proveedor para evitar columnas nulas y mezclar reglas de local/google
- roles y user_roles evitan hardcodear rol unico y permiten evolucion a permisos finos
- user_sessions separa estado de sesion del perfil de usuario y soporta multi-dispositivo
- audit_log desacoplado para trazabilidad transversal de eventos

## Notas de evolucion a largo plazo

- Evitar IDs semanticos (nunca codificar negocio dentro del PK).
- Mantener PK inmutable y usar columnas separadas para identificadores de negocio visibles.
- Si se requiere exponer un identificador publico estable, usar public_id UUID adicional sin cambiar el PK interno.

## Siguiente paso de implementacion

1. Crear carpeta db/migrations con SQL versionado.
2. Migracion 001: extensiones, tablas base, indices y constraints (incluyendo user_sessions).
3. Migracion 002: seeds de roles (admin, normal).
4. Migracion 003: funciones/indices para limpieza de sesiones expiradas.
5. Integrar un runner simple de migraciones desde la API (node + pg) o usar una herramienta dedicada.
6. Agregar endpoint de bootstrap admin inicial (solo en entorno seguro).

## Notas de seguridad

- No guardar secretos reales en .env.example
- En login local usar Argon2id o bcrypt (cost factor actualizado)
- En login Google validar id_token (issuer, audience, exp, email_verified)
- Guardar solo hashes de refresh tokens, nunca el token en texto plano
- Rotar refresh token en cada uso (refresh token rotation)
- Registrar eventos de auth (login exitoso/fallido, bloqueo, cambio de password) en audit_log
