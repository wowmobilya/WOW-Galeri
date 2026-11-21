import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');

// Provider integrations are memory-only test doubles; no external request occurs.
export const PROVIDER_FIXTURES=`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;create schema storage;create schema vault;create schema net;create schema cron;create schema extensions;
create table auth.users(id uuid primary key,instance_id uuid,aud text,role text,email text,email_confirmed_at timestamptz,
  created_at timestamptz,updated_at timestamptz,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),created_at timestamptz,updated_at timestamptz,aal text,not_after timestamptz);
create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text);
create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(secret text,name text,description text default '') returns uuid language sql as $$
  insert into vault.secrets(secret,name,description) values($1,$2,$3) returning id $$;
create table net.local_test_calls(id bigint generated always as identity,url text,headers jsonb,body jsonb);
create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000)
  returns bigint language sql as $$insert into net.local_test_calls(url,headers,body) values($1,$4,$2) returning id$$;
create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
create function cron.schedule(job_name text,schedule text,command text) returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
`;

export async function createProviderTestDatabase(){
  const db=new PGlite({extensions:{pgcrypto}});
  try{
    await db.exec(PROVIDER_FIXTURES);
    const migration=(await readFile(new URL('../wow-schema.sql',import.meta.url),'utf8'))
      .replace(/^create extension if not exists pg_net;$/m,'-- local pg_net fixture')
      .replace(/^create extension if not exists pg_cron with schema pg_catalog;$/m,'-- local cron fixture');
    await db.exec(migration);
    return db;
  }catch(error){await db.close();throw error;}
}
