-- EDC Roulette, schema version 1.
--
-- EDC Roulette shares Belay Buddy's Supabase projects (belaybuddy-dev for
-- develop, belaybuddy-prod for master). Everything EDC owns lives in the `edc`
-- schema, so nothing here touches Belay Buddy's `public` tables, functions or
-- policies. Accounts (auth.users) are shared: one sign-in works in both apps.
--
-- Access model (from the spec):
--   * Free users are anonymous and keep everything on the phone; nothing here.
--   * Signed-in users can read their own rows.
--   * Only premium accounts can write cloud data (gear, slots, friends, API keys).
--   * Gear photos are never written by the app directly: the edc-image-upload
--     Edge Function checks them with Google Cloud Vision and stores them with
--     the service role.
--   * Tier/premium status is only ever changed by the service role
--     (subscription webhooks, phase 3), never by the user.
--
-- Applied by .github/workflows/supabase-edc.yml, which records each file in
-- edc.schema_migrations so it runs once.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists edc;
grant usage on schema edc to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function edc.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per account that has signed in to EDC Roulette.
-- Created by edc.ensure_profile() on first sign-in (not by an auth trigger, so
-- Belay Buddy-only accounts never get one).
-- ---------------------------------------------------------------------------
create table edc.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 50),
  tier text not null default 'free' check (tier in ('free', 'premium')),
  premium_until timestamptz,
  -- Short code people share to add each other as EDC Friends.
  friend_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on edc.profiles
  for each row execute function edc.set_updated_at();

alter table edc.profiles enable row level security;
revoke all on table edc.profiles from anon, authenticated;
grant select on table edc.profiles to authenticated;
-- Users may only change their display name; tier and premium_until belong to
-- the service role.
grant update (display_name) on table edc.profiles to authenticated;
grant all on table edc.profiles to service_role;

create function edc.is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from edc.profiles p
    where p.id = uid
      and p.tier = 'premium'
      and (p.premium_until is null or p.premium_until > now())
  );
$$;
revoke execute on function edc.is_premium(uuid) from public, anon;
grant execute on function edc.is_premium(uuid) to authenticated, service_role;

-- Creates the caller's EDC profile if it doesn't exist yet; returns it.
create function edc.ensure_profile()
returns edc.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result edc.profiles;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into edc.profiles (id) values (me) on conflict (id) do nothing;
  select * into result from edc.profiles where id = me;
  return result;
end;
$$;
revoke execute on function edc.ensure_profile() from public, anon;
grant execute on function edc.ensure_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- friendships: EDC Friends (premium). A request is a pending row from
-- user_id to friend_id; the friend accepts it.
-- ---------------------------------------------------------------------------
create table edc.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references edc.profiles (id) on delete cascade,
  friend_id uuid not null references edc.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);
create index friendships_friend_id_idx on edc.friendships (friend_id);

create function edc.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from edc.friendships f
    where f.status = 'accepted'
      and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a))
  );
$$;
revoke execute on function edc.are_friends(uuid, uuid) from public, anon;
grant execute on function edc.are_friends(uuid, uuid) to authenticated, service_role;

alter table edc.friendships enable row level security;
revoke all on table edc.friendships from anon, authenticated;
grant select, delete on table edc.friendships to authenticated;
grant update (status) on table edc.friendships to authenticated;
grant all on table edc.friendships to service_role;

create policy "edc: see friendships you're part of"
  on edc.friendships for select to authenticated
  using ((select auth.uid()) in (user_id, friend_id));

create policy "edc: accept requests sent to you"
  on edc.friendships for update to authenticated
  using ((select auth.uid()) = friend_id and status = 'pending')
  with check ((select auth.uid()) = friend_id and status = 'accepted');

create policy "edc: remove friendships you're part of"
  on edc.friendships for delete to authenticated
  using ((select auth.uid()) in (user_id, friend_id));

-- Profiles: your own, plus friends' and people with a pending request either way
-- (so a request can show who it's from).
create policy "edc: read your own profile and your friends'"
  on edc.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from edc.friendships f
      where (f.user_id = (select auth.uid()) and f.friend_id = edc.profiles.id)
         or (f.friend_id = (select auth.uid()) and f.user_id = edc.profiles.id)
    )
  );

create policy "edc: update your own display name"
  on edc.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Sends a friend request by friend code. Premium only. Accepts straight away if
-- the other person had already sent one.
create function edc.send_friend_request(code text)
returns edc.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  them uuid;
  result edc.friendships;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not edc.is_premium(me) then raise exception 'EDC Friends is a Premium feature'; end if;
  select id into them from edc.profiles where friend_code = upper(trim(code));
  if them is null then raise exception 'No one has that friend code'; end if;
  if them = me then raise exception 'That''s your own friend code'; end if;

  update edc.friendships set status = 'accepted'
    where user_id = them and friend_id = me and status = 'pending'
    returning * into result;
  if found then return result; end if;

  insert into edc.friendships (user_id, friend_id) values (me, them)
    on conflict (user_id, friend_id) do update set user_id = excluded.user_id
    returning * into result;
  return result;
end;
$$;
revoke execute on function edc.send_friend_request(text) from public, anon;
grant execute on function edc.send_friend_request(text) to authenticated;

-- ---------------------------------------------------------------------------
-- gear_items: the cloud copy of a premium user's collection.
-- ---------------------------------------------------------------------------
create table edc.gear_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references edc.profiles (id) on delete cascade,
  -- The id the item had on the phone before it was synced, so syncing twice
  -- never makes duplicates.
  local_id text,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 40),
  material text check (char_length(material) <= 40),
  finish text check (char_length(finish) <= 40),
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  weight_grams numeric(8, 1) check (weight_grams >= 0 and weight_grams < 100000),
  notes text check (char_length(notes) <= 1000),
  -- Path inside the edc-gear storage bucket, written by the upload function.
  image_path text,
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);
create index gear_items_user_id_idx on edc.gear_items (user_id);

create trigger gear_items_set_updated_at
  before update on edc.gear_items
  for each row execute function edc.set_updated_at();

alter table edc.gear_items enable row level security;
revoke all on table edc.gear_items from anon, authenticated;
grant select, insert, update, delete on table edc.gear_items to authenticated;
grant all on table edc.gear_items to service_role;

create policy "edc: read your own gear and friends' gear"
  on edc.gear_items for select to authenticated
  using (user_id = (select auth.uid()) or edc.are_friends((select auth.uid()), user_id));

create policy "edc: premium users add gear"
  on edc.gear_items for insert to authenticated
  with check (user_id = (select auth.uid()) and edc.is_premium((select auth.uid())));

create policy "edc: premium users edit their gear"
  on edc.gear_items for update to authenticated
  using (user_id = (select auth.uid()) and edc.is_premium((select auth.uid())))
  with check (user_id = (select auth.uid()));

-- Deleting stays allowed after premium lapses, so people can always clean up.
create policy "edc: delete your own gear"
  on edc.gear_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- slots: the roulette reels (premium users get more than the free 4).
-- ---------------------------------------------------------------------------
create table edc.slots (
  user_id uuid not null default auth.uid() references edc.profiles (id) on delete cascade,
  slot_index smallint not null check (slot_index between 0 and 49),
  active_category text not null check (char_length(active_category) between 1 and 40),
  locked_item_id uuid references edc.gear_items (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_index)
);

create trigger slots_set_updated_at
  before update on edc.slots
  for each row execute function edc.set_updated_at();

alter table edc.slots enable row level security;
revoke all on table edc.slots from anon, authenticated;
grant select, insert, update, delete on table edc.slots to authenticated;
grant all on table edc.slots to service_role;

create policy "edc: read your own slots"
  on edc.slots for select to authenticated
  using (user_id = (select auth.uid()));

create policy "edc: premium users add slots"
  on edc.slots for insert to authenticated
  with check (user_id = (select auth.uid()) and edc.is_premium((select auth.uid())));

create policy "edc: premium users change slots"
  on edc.slots for update to authenticated
  using (user_id = (select auth.uid()) and edc.is_premium((select auth.uid())))
  with check (user_id = (select auth.uid()));

create policy "edc: delete your own slots"
  on edc.slots for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- api_keys: personal API keys for the collection API (premium). Only a SHA-256
-- hash is stored; the key itself is shown once, when created.
-- ---------------------------------------------------------------------------
create table edc.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references edc.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_user_id_idx on edc.api_keys (user_id);

alter table edc.api_keys enable row level security;
revoke all on table edc.api_keys from anon, authenticated;
grant select (id, user_id, name, prefix, created_at, last_used_at, revoked_at) on table edc.api_keys to authenticated;
grant update (revoked_at) on table edc.api_keys to authenticated;
grant all on table edc.api_keys to service_role;

create policy "edc: see your own API keys"
  on edc.api_keys for select to authenticated
  using (user_id = (select auth.uid()));

create policy "edc: revoke your own API keys"
  on edc.api_keys for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and revoked_at is not null);

-- Creates a key and returns it once ("edc_" + 40 hex characters). Premium only,
-- at most 5 active keys.
create function edc.create_api_key(key_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  raw text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not edc.is_premium(me) then raise exception 'API keys are a Premium feature'; end if;
  if (select count(*) from edc.api_keys where user_id = me and revoked_at is null) >= 5 then
    raise exception 'You already have 5 active API keys; revoke one first';
  end if;
  raw := 'edc_' || encode(extensions.gen_random_bytes(20), 'hex');
  insert into edc.api_keys (user_id, name, prefix, key_hash)
    values (me, trim(key_name), left(raw, 10), encode(extensions.digest(raw, 'sha256'), 'hex'));
  return raw;
end;
$$;
revoke execute on function edc.create_api_key(text) from public, anon;
grant execute on function edc.create_api_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving EDC Roulette without deleting the shared account: removes the EDC
-- profile, which cascades to gear, slots, friendships and API keys. (Photos in
-- storage are removed by the app/function first.) Belay Buddy data is untouched.
-- ---------------------------------------------------------------------------
create function edc.delete_my_edc_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  delete from edc.profiles where id = (select auth.uid());
end;
$$;
revoke execute on function edc.delete_my_edc_data() from public, anon;
grant execute on function edc.delete_my_edc_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Gear photo storage: private bucket, one folder per user (<user id>/...).
-- Only the service role (the upload function, after the Vision check) writes.
-- Owners and their friends can read; owners can delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edc-gear', 'edc-gear', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function edc.photo_owner(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;
grant execute on function edc.photo_owner(text) to authenticated, service_role;

create policy "edc: read your own and friends' gear photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'edc-gear'
    and (
      edc.photo_owner(name) = (select auth.uid())
      or edc.are_friends((select auth.uid()), edc.photo_owner(name))
    )
  );

create policy "edc: delete your own gear photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'edc-gear' and edc.photo_owner(name) = (select auth.uid()));

-- Ask the Data API to pick up the new schema.
notify pgrst, 'reload schema';
