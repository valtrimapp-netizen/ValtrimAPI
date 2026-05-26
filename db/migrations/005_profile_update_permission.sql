INSERT INTO cat_permissions (code, name)
VALUES
  ('auth.self.update', 'Actualizar perfil propio')
ON CONFLICT (code)
DO UPDATE SET name = EXCLUDED.name;

INSERT INTO rel_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM cat_roles r
INNER JOIN cat_permissions p ON p.code = 'auth.self.update'
WHERE r.code IN ('normal', 'admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;
