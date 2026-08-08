CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer')),
  active boolean NOT NULL DEFAULT true,
  avatar_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS branding (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name text NOT NULL DEFAULT 'Nexus',
  brand_tagline text NOT NULL DEFAULT 'Infrastructure command center',
  primary_color text NOT NULL DEFAULT '#2563eb',
  accent_color text NOT NULL DEFAULT '#7c3aed',
  font_family text NOT NULL DEFAULT 'Inter',
  base_font_size integer NOT NULL DEFAULT 15,
  logo_path text,
  login_logo_path text,
  favicon_path text,
  login_background_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cloudflare_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_hint text,
  token_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  tld text,
  provider text,
  current_price numeric(12,2),
  registered_at date,
  last_renewed_at date,
  expires_at date,
  renewal_price numeric(12,2),
  currency text NOT NULL DEFAULT 'INR',
  hosting text,
  dns_provider text,
  notes text,
  free_tier boolean NOT NULL DEFAULT false,
  cloudflare_connection_id uuid REFERENCES cloudflare_connections(id) ON DELETE SET NULL,
  cloudflare_zone_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subdomains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name text NOT NULL,
  dns_name text,
  record_type text,
  service text,
  host text,
  path text,
  ipv4 text,
  proxied boolean,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(domain_id, name)
);

CREATE TABLE IF NOT EXISTS servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  os text,
  ipv4 text,
  wan_ipv4 text,
  enrollment_token_hash text,
  enrollment_expires_at timestamptz,
  agent_token_hash text,
  enrolled_at timestamptz,
  last_seen_at timestamptz,
  agent_version text,
  active boolean NOT NULL DEFAULT true,
  icon_path text,
  refresh_interval_ms integer NOT NULL DEFAULT 1000 CHECK (refresh_interval_ms BETWEEN 1000 AND 300000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS icon_path text;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS refresh_interval_ms integer NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS server_metrics (
  id bigserial PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  cpu numeric(6,2) NOT NULL DEFAULT 0,
  ram numeric(6,2) NOT NULL DEFAULT 0,
  temperature numeric(7,2),
  uptime_seconds bigint NOT NULL DEFAULT 0,
  load1 numeric(8,2),
  disks jsonb NOT NULL DEFAULT '[]'::jsonb,
  network jsonb NOT NULL DEFAULT '{}'::jsonb,
  proxies jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_metrics_server_time_idx ON server_metrics (server_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_to text,
  webhook_url text,
  offline_minutes integer NOT NULL DEFAULT 3,
  renewal_days integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  resolved_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_dedupe_idx ON alerts (dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
