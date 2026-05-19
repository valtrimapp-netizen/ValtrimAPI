---
applyTo: "src/**/*.js,src/app.js,src/server.js"
description: >
  Use when adding routes, controllers, services, models, or middlewares to ValtrimAPI.
  Enforces the no-Express architecture, route array pattern, auth config, error throwing
  conventions, and response format. Apply to any API modification.
---

# ValtrimAPI — Structure & Conventions

## Architecture overview

This API uses **Express 5** with `helmet` (security headers) and `cors`.  
The request pipeline is: `helmet → cors → express.json() → Router → requireAuth() → handler → expressErrorHandler`.

```
src/
  app.js            ← creates Express app, registers all middleware and router
  server.js         ← calls app.listen(), verifyDatabaseAtStartup
  config/           ← env.js (all env vars), database.js (pool + query helper)
  routes/
    index.js        ← merges all route arrays, exports createRouter() → Express Router
    *.routes.js     ← one file per domain, exports a plain array of route objects
  controllers/      ← HTTP layer only: read req.body, validate, call service, res.json()
  services/         ← all business logic and DB access
  models/           ← input validation schemas, return { ok, value, errors }
  middlewares/
    auth.js         ← requireAuth(config) factory + authorizeRequest()
    errorHandler.js ← expressErrorHandler (4-param Express error middleware)
  utils/
    errors.js       ← HttpError hierarchy + assert()
```

---

## Route definitions

Routes are **plain JS objects** in an array — never Express Router or framework equivalents.

```js
// src/routes/widgets.routes.js
import { listWidgets, createWidget } from '../controllers/widgets.controller.js';

export const widgetRoutes = [
  {
    method: 'GET',
    path: '/api/widgets',
    auth: { required: true, permissionsAll: ['widgets.read'] },
    handler: listWidgets,
  },
  {
    method: 'POST',
    path: '/api/widgets',
    auth: { required: true, permissionsAll: ['widgets.create'] },
    handler: createWidget,
  },
  {
    method: 'GET',
    path: '/api/widgets/:id',          // ← :param segments supported
    auth: { required: true, permissionsAll: ['widgets.read'] },
    handler: getWidgetById,
  },
];
```

### `auth` config shape

| Field | Type | Effect |
|---|---|---|
| `required` | `boolean` | If `true`, bearer token is mandatory |
| `permissionsAll` | `string[]` | User must hold ALL listed permissions |
| `permissionsAny` | `string[]` | User must hold AT LEAST ONE listed permission |
| `roles` | `string[]` | User must hold at least one listed role |

Omit `auth` entirely for public routes.

### Registering routes

Add the new array to `src/routes/index.js`:

```js
import { widgetRoutes } from './widgets.routes.js';

export const routes = [
  ...healthRoutes,
  ...authRoutes,
  ...extractionRoutes,
  ...widgetRoutes,   // ← add here
];
```

`createRouter()` in `index.js` automatically converts the array into an Express Router,  
wrapping each handler with `asyncHandler` and injecting `requireAuth(route.auth)` when present.

---

## Controllers

Controllers own the **HTTP boundary only**: read `req.body`, validate, call service, `res.json()`.  
They must **never** access the DB directly or contain business logic.

```js
// src/controllers/widgets.controller.js
import { UnprocessableEntityError } from '../utils/errors.js';
import { validateCreateWidgetPayload } from '../models/widgets.schema.js';
import { createWidgetService } from '../services/widgets.service.js';

export async function createWidget(req, res) {
  const body = req.body ?? {};
  const validation = validateCreateWidgetPayload(body);
  if (!validation.ok) {
    throw new UnprocessableEntityError('Invalid payload', validation.errors);
  }

  const result = await createWidgetService(validation.value, req.auth);
  res.status(201).json(result);
}
```

**Rules:**
- Read body from `req.body ?? {}` — Express `express.json()` already parses it.
- Validate with schema function from `models/` — returns `{ ok, value, errors }`.
- On invalid input, **throw** a typed error (see Errors section below). Never send manually.
- Use `res.json(body)` (200) or `res.status(N).json(body)` for other codes.
- `req.auth` is populated by `requireAuth()` when the route has `auth.required: true`.
  Shape: `{ userId, sessionId, roles: string[], permissions: string[] }`.
- **Never** call `next()` from a controller — `asyncHandler` in `routes/index.js` handles errors.

---

## Services

Services own all business logic and database access.

```js
// src/services/widgets.service.js
import { query } from '../config/database.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export async function createWidgetService(data, auth) {
  const existing = await query(
    'SELECT id FROM widgets WHERE name = $1',
    [data.name]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('A widget with that name already exists.');
  }

  const { rows } = await query(
    'INSERT INTO widgets (name, owner_id) VALUES ($1, $2) RETURNING *',
    [data.name, auth.userId]
  );
  return rows[0];
}
```

**Rules:**
- Import `query` from `../config/database.js` — never instantiate a new Pool.
- For multi-statement operations use a transaction via the pool client directly.
- Throw typed `HttpError` subclasses for expected failures (see Errors section).
- Let unexpected DB errors bubble up — `errorHandler.js` classifies PG error codes.

---

## Input validation (models)

Validation functions return `{ ok: true, value } | { ok: false, errors }`.

```js
// src/models/widgets.schema.js
export function validateCreateWidgetPayload(body) {
  const errors = [];
  if (!body?.name || typeof body.name !== 'string') {
    errors.push({ field: 'name', message: 'name is required and must be a string' });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name: body.name.trim() } };
}
```

---

## Error handling

**Always throw — never call `sendError` from controllers or services.**  
`app.js` catches all unhandled errors and routes them through `classifyError()`.

### Available typed errors (from `utils/errors.js`)

```js
import {
  HttpError,                  // base — use when no named subclass fits
  BadRequestError,            // 400
  UnauthorizedError,          // 401
  ForbiddenError,             // 403
  NotFoundError,              // 404
  MethodNotAllowedError,      // 405
  ConflictError,              // 409
  UnprocessableEntityError,   // 422  ← accepts details array
  TooManyRequestsError,       // 429
  InternalServerError,        // 500
  NotImplementedError,        // 501
  ServiceUnavailableError,    // 503
} from '../utils/errors.js';
```

Use `assert()` for inline guard clauses:
```js
import { assert } from '../utils/errors.js';
assert(id, 'id is required', 400);
assert(record, 'Record not found', 404);
```

### Error response shape

All errors are serialized as:
```json
{
  "error": {
    "status": 422,
    "code": "UNPROCESSABLE_ENTITY",
    "message": "Invalid payload",
    "details": [{ "field": "name", "message": "name is required" }]
  }
}
```

- 5xx errors are **logged to stderr** with full stack by `sendError`.
- 5xx messages are hidden from the client in `NODE_ENV=production`.

---

## Response format

All successful responses use the Express response object directly:

```js
res.json(body);           // 200
res.status(201).json(body);
res.status(204).end();    // no content
```

Do **not** import or call `sendJson()` or `corsHeaders()` from controllers.

---

## Adding a new domain — checklist

When adding a new feature domain (e.g., "projects", "invoices"):

- [ ] `db/migrations/NNN_<description>.sql` — table + indexes (follow `database-standards.instructions.md`)
- [ ] `db/migrations/NNN_permissions_<domain>.sql` — permissions in `cat_permissions` + role grants
- [ ] `npm run migrate` — apply migrations before writing service code
- [ ] `src/models/<domain>.schema.js` — validation functions
- [ ] `src/services/<domain>.service.js` — business logic
- [ ] `src/controllers/<domain>.controller.js` — HTTP handlers
- [ ] `src/routes/<domain>.routes.js` — route array with auth config
- [ ] Register in `src/routes/index.js`

---

## Hard rules

1. **Use Express for HTTP.** Never add a manual `http.createServer` pipeline.
2. **No direct `pg.Pool` instantiation.** Always use `getDbPool()` or `query()` from `config/database.js`.
3. **No business logic in controllers.** Move it to the service layer.
4. **No DB access in controllers.** Controllers call services only.
5. **No manual `res.writeHead()` or `sendJson()` in controllers.** Use `res.json()` / `res.status().json()`.
6. **Every protected route must have an explicit `auth` config.** Omitting it makes the route public — this must be intentional.
7. **Every new permission must be seeded** in `cat_permissions` and granted via `rel_role_permissions` in a migration before use.
8. **One route file per domain.** Never add routes for a different domain to an existing routes file.
