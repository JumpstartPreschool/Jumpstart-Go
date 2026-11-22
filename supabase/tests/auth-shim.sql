-- Test-only stand-in for the parts of Supabase the migrations rely on: the API roles,
-- auth.users, auth.sessions and auth.uid(). auth.uid() reads the JWT claims the same way Supabase does.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, phone text, encrypted_password text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, raw_app_meta_data jsonb not null default '{}');
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;

grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Storage's bucket list, so migrations that create a bucket (0027) run here as on Supabase.
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
