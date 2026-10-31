INSERT INTO users (id, email, username, password_hash)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'sofia@example.test', 'sofia.rios', NULL),
  ('00000000-0000-4000-8000-000000000002', 'marcelo@example.test', 'marcelo', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO profiles (user_id, display_name, bio, location)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Sofía Ríos', 'Fotografía, viajes lentos y mar.', 'Oaxaca, México'),
  ('00000000-0000-4000-8000-000000000002', 'Marcelo Vega', 'Diseñador independiente. Café primero.', 'Ciudad de México')
ON CONFLICT DO NOTHING;

INSERT INTO posts (id, author_id, body, published_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Hay lugares que te enseñan a bajar el ritmo. Este rincón del Pacífico se quedó conmigo.', now() - interval '24 minutes'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002', 'Luz de las seis, café recién hecho y una idea que por fin encuentra su forma.', now() - interval '1 hour')
ON CONFLICT DO NOTHING;
