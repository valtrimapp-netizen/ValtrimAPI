INSERT INTO cat_roles (code, name)
VALUES
  ('admin', 'Administrador'),
  ('normal', 'Usuario normal')
ON CONFLICT (code)
DO UPDATE SET name = EXCLUDED.name;
