CREATE TABLE IF NOT EXISTS cat_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cat_permissions_code_lower_chk CHECK (code = lower(code))
);

CREATE TABLE IF NOT EXISTS rel_role_permissions (
  role_id UUID NOT NULL REFERENCES cat_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES cat_permissions(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS rel_role_permissions_permission_id_idx
  ON rel_role_permissions(permission_id);

INSERT INTO cat_permissions (code, name)
VALUES
  ('auth.self.read', 'Ver perfil propio'),
  ('auth.session.revoke', 'Cerrar sesion actual'),
  ('auth.session.revoke_all', 'Cerrar todas las sesiones propias'),
  ('extractions.create', 'Crear extracciones'),
  ('extractions.read', 'Consultar extracciones'),
  ('admin.panel', 'Acceso administrativo general')
ON CONFLICT (code)
DO UPDATE SET name = EXCLUDED.name;

INSERT INTO rel_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM cat_roles r
INNER JOIN cat_permissions p ON p.code IN (
  'auth.self.read',
  'auth.session.revoke',
  'auth.session.revoke_all',
  'extractions.create',
  'extractions.read'
)
WHERE r.code = 'normal'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO rel_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM cat_roles r
INNER JOIN cat_permissions p ON TRUE
WHERE r.code = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
