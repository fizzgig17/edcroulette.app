-- EDC Roulette, schema version 2: the shared brand catalog, brand
-- suggestions, and the daily limits for AI photo identification.
--
-- * edc.brands: one catalog for everyone. Approved brands are readable without
--   an account (the free app uses them to suggest and correct brand names).
-- * edc.suggest_brand(): anyone can propose a missing brand. Only the name and
--   category are sent (no account, no personal data); it waits as 'pending'
--   until Marc approves it (Table Editor: edc.brands, set status = 'approved').
--   Rate-limited per device and in total.
-- * edc.match_brands(): forgiving search (misspellings, spacing, accents,
--   aliases), used by the identify function and available to the app.
-- * edc.take_identify_quota(): per-device, per-IP and global daily limits for
--   the edc-identify Edge Function. Only the service role can call it.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- 0..1 closeness of two keys: the better of edit distance (letters added,
-- removed or changed) and slightly discounted trigram similarity, plus a small
-- bonus for a shared start (typos rarely hit the first letters). Handles short
-- names and single typos ("spydercoo" ~ "spyderco").
create function edc.key_closeness(a text, b text)
returns real
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when coalesce(a, '') = '' or coalesce(b, '') = '' then 0
    when a = b then 1
    else least(1, greatest(
      extensions.similarity(a, b) * 0.85,
      1 - extensions.levenshtein(left(a, 100), left(b, 100))::real / greatest(length(a), length(b))
    ) + case when left(a, 2) = left(b, 2) then 0.05 else 0 end)
  end::real;
$$;

-- Lowercase, no accents, letters and digits only: "Böker Plus" -> "bokerplus".
create function edc.brand_key(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿß', 'aaaaaaceeeeiiiinoooooouuuuyys'),
    '[^a-z0-9]+', '', 'g');
$$;

create table edc.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  key text generated always as (edc.brand_key(name)) stored,
  aliases text[] not null default '{}',
  categories text[] not null default '{}',
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  -- How many times people suggested it (helps decide what to approve first).
  suggested_count integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index brands_key_idx on edc.brands (key);
create index brands_key_trgm_idx on edc.brands using gin (key extensions.gin_trgm_ops);

alter table edc.brands enable row level security;
revoke all on table edc.brands from anon, authenticated;
grant select (id, name, aliases, categories, status) on table edc.brands to anon, authenticated;
grant all on table edc.brands to service_role;

create policy "edc: everyone reads approved brands"
  on edc.brands for select to anon, authenticated
  using (status = 'approved');

-- Forgiving search over approved brands and their aliases. Returns the best
-- matches with a score from 0 to 1 (1 = exact).
create function edc.match_brands(q text, max_results integer default 5)
returns table (name text, score real, categories text[])
language sql
stable
security definer
set search_path = ''
as $$
  with query as (select edc.brand_key(q) as k)
  select b.name,
         greatest(
           case when b.key = query.k then 1.0 else 0 end,
           case when length(query.k) >= 3 and b.key like query.k || '%' then 0.9 else 0 end,
           edc.key_closeness(b.key, query.k),
           coalesce((select max(edc.key_closeness(edc.brand_key(a), query.k)) from unnest(b.aliases) a), 0)
         )::real as score,
         b.categories
  from edc.brands b, query
  where b.status = 'approved' and length(query.k) > 0
  order by score desc, b.name
  limit greatest(1, least(coalesce(max_results, 5), 20));
$$;
revoke execute on function edc.match_brands(text, integer) from public;
grant execute on function edc.match_brands(text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Suggestions
-- ---------------------------------------------------------------------------
create table edc.brand_suggestion_log (
  id bigint generated always as identity primary key,
  device_hash text not null,
  brand_key text not null,
  created_at timestamptz not null default now()
);
create index brand_suggestion_log_device_idx on edc.brand_suggestion_log (device_hash, created_at);
alter table edc.brand_suggestion_log enable row level security;
revoke all on table edc.brand_suggestion_log from anon, authenticated;
grant all on table edc.brand_suggestion_log to service_role;

-- Proposes a brand. Returns {status: 'exists', name} when it's already in the
-- catalog (or close enough to one), else {status: 'pending', name}.
-- Limits: 10 suggestions per device per day, 300 in total per day.
create function edc.suggest_brand(brand_name text, category text, device text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(regexp_replace(coalesce(brand_name, ''), '\s+', ' ', 'g'));
  k text := edc.brand_key(brand_name);
  dev text := encode(extensions.digest(coalesce(device, ''), 'sha256'), 'hex');
  best record;
begin
  if char_length(clean) < 2 or char_length(clean) > 60 or length(k) < 2 then
    raise exception 'Brand names are 2 to 60 characters';
  end if;
  if coalesce(device, '') = '' then raise exception 'Missing device id'; end if;

  select * into best from edc.match_brands(clean, 1);
  if best.name is not null and best.score >= 0.8 then
    return jsonb_build_object('status', 'exists', 'name', best.name);
  end if;

  if (select count(*) from edc.brand_suggestion_log where device_hash = dev and created_at > now() - interval '1 day') >= 10
     or (select count(*) from edc.brand_suggestion_log where created_at > now() - interval '1 day') >= 300 then
    raise exception 'Too many suggestions today. Try again tomorrow.';
  end if;
  insert into edc.brand_suggestion_log (device_hash, brand_key) values (dev, k);

  insert into edc.brands (name, categories, status, suggested_count)
  values (clean, case when category is null or category = '' then '{}' else array[category] end, 'pending', 1)
  on conflict (key) do update
    set suggested_count = edc.brands.suggested_count + 1,
        categories = case
          when excluded.categories = '{}' or excluded.categories[1] = any (edc.brands.categories) then edc.brands.categories
          else edc.brands.categories || excluded.categories end;

  select name, status into best from edc.brands where key = k;
  return jsonb_build_object('status', case when best.status = 'approved' then 'exists' else 'pending' end, 'name', best.name);
end;
$$;
revoke execute on function edc.suggest_brand(text, text, text) from public;
grant execute on function edc.suggest_brand(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI identification limits (used only by the edc-identify function)
-- ---------------------------------------------------------------------------
create table edc.identify_usage (
  day date not null default (now() at time zone 'utc')::date,
  bucket text not null,
  count integer not null default 0,
  primary key (day, bucket)
);
alter table edc.identify_usage enable row level security;
revoke all on table edc.identify_usage from anon, authenticated;
grant all on table edc.identify_usage to service_role;

-- Takes one use from every bucket if all are under their limits; returns
-- false (and takes nothing) if any bucket is full.
create function edc.take_identify_quota(buckets text[], limits integer[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  i integer;
begin
  if array_length(buckets, 1) is distinct from array_length(limits, 1) then
    raise exception 'buckets and limits differ in length';
  end if;
  for i in 1 .. coalesce(array_length(buckets, 1), 0) loop
    insert into edc.identify_usage (day, bucket, count) values (today, buckets[i], 0)
      on conflict (day, bucket) do nothing;
    if (select count from edc.identify_usage where day = today and bucket = buckets[i] for update) >= limits[i] then
      return false;
    end if;
  end loop;
  update edc.identify_usage set count = count + 1 where day = today and bucket = any (buckets);
  -- Keep a week of history.
  delete from edc.identify_usage where day < today - 7;
  return true;
end;
$$;
revoke execute on function edc.take_identify_quota(text[], integer[]) from public, anon, authenticated;
grant execute on function edc.take_identify_quota(text[], integer[]) to service_role;

-- ---------------------------------------------------------------------------
-- Seed: the starting catalog (generated from src/content/brands.json).
-- ---------------------------------------------------------------------------
insert into edc.brands (name, aliases, categories) values
  ('Spyderco', array['spider co','spydie']::text[], array['Knife','Pen']::text[]),
  ('Benchmade', array['bench made','bm']::text[], array['Knife']::text[]),
  ('Chris Reeve Knives', array['chris reeve','crk']::text[], array['Knife']::text[]),
  ('Kershaw', '{}'::text[], array['Knife']::text[]),
  ('Zero Tolerance', array['zt']::text[], array['Knife']::text[]),
  ('CRKT', array['columbia river knife and tool','columbia river']::text[], array['Knife','Multi-tool']::text[]),
  ('Buck Knives', array['buck']::text[], array['Knife']::text[]),
  ('Victorinox', array['swiss army','victorinox swiss army']::text[], array['Knife','Multi-tool']::text[]),
  ('Wenger', '{}'::text[], array['Knife','Multi-tool']::text[]),
  ('Leatherman', array['leather man']::text[], array['Multi-tool','Knife']::text[]),
  ('Gerber', '{}'::text[], array['Knife','Multi-tool']::text[]),
  ('SOG', array['sog knives']::text[], array['Knife','Multi-tool']::text[]),
  ('Ka-Bar', array['kabar','ka bar']::text[], array['Knife']::text[]),
  ('Cold Steel', '{}'::text[], array['Knife']::text[]),
  ('Civivi', '{}'::text[], array['Knife']::text[]),
  ('WE Knife', array['we knife co','we']::text[], array['Knife']::text[]),
  ('Kizer', '{}'::text[], array['Knife']::text[]),
  ('QSP', array['qsp knife']::text[], array['Knife']::text[]),
  ('Microtech', array['micro tech','mt']::text[], array['Knife']::text[]),
  ('Hinderer Knives', array['hinderer','rick hinderer']::text[], array['Knife']::text[]),
  ('Böker', array['boker','boeker','boker plus']::text[], array['Knife']::text[]),
  ('Opinel', '{}'::text[], array['Knife']::text[]),
  ('Ontario Knife Company', array['ontario','okc']::text[], array['Knife']::text[]),
  ('ESEE', array['esee knives']::text[], array['Knife']::text[]),
  ('Morakniv', array['mora']::text[], array['Knife']::text[]),
  ('Fällkniven', array['fallkniven']::text[], array['Knife']::text[]),
  ('Case', array['case knives','w.r. case','wr case']::text[], array['Knife']::text[]),
  ('Great Eastern Cutlery', array['gec']::text[], array['Knife']::text[]),
  ('Real Steel', '{}'::text[], array['Knife']::text[]),
  ('Sencut', '{}'::text[], array['Knife']::text[]),
  ('Bestech', array['bestech knives']::text[], array['Knife']::text[]),
  ('Vosteed', '{}'::text[], array['Knife']::text[]),
  ('Reate', '{}'::text[], array['Knife']::text[]),
  ('Shirogorov', '{}'::text[], array['Knife']::text[]),
  ('Hogue', '{}'::text[], array['Knife']::text[]),
  ('Emerson Knives', array['emerson']::text[], array['Knife']::text[]),
  ('Strider Knives', array['strider']::text[], array['Knife']::text[]),
  ('Medford Knife & Tool', array['medford','mkt']::text[], array['Knife']::text[]),
  ('Protech', array['pro-tech','pro tech']::text[], array['Knife']::text[]),
  ('Demko Knives', array['demko']::text[], array['Knife']::text[]),
  ('Tactile Knife Co', array['tactile knife']::text[], array['Knife']::text[]),
  ('Artisan Cutlery', array['artisan']::text[], array['Knife']::text[]),
  ('CJRB', array['cjrb cutlery']::text[], array['Knife']::text[]),
  ('Ruike', '{}'::text[], array['Knife','Multi-tool']::text[]),
  ('Nextool', array['next tool']::text[], array['Multi-tool','Knife']::text[]),
  ('Roxon', '{}'::text[], array['Multi-tool','Knife']::text[]),
  ('Olight', array['o light']::text[], array['Flashlight']::text[]),
  ('Fenix', array['fenix lighting']::text[], array['Flashlight']::text[]),
  ('Nitecore', array['nite core']::text[], array['Flashlight']::text[]),
  ('Streamlight', array['stream light']::text[], array['Flashlight']::text[]),
  ('SureFire', array['sure fire']::text[], array['Flashlight']::text[]),
  ('Acebeam', array['ace beam']::text[], array['Flashlight']::text[]),
  ('Wurkkos', array['wurkos']::text[], array['Flashlight']::text[]),
  ('Sofirn', '{}'::text[], array['Flashlight']::text[]),
  ('Emisar', '{}'::text[], array['Flashlight']::text[]),
  ('Noctigon', '{}'::text[], array['Flashlight']::text[]),
  ('Hank Light', array['hanklight','intl-outdoor','intl outdoor']::text[], array['Flashlight']::text[]),
  ('Lumintop', '{}'::text[], array['Flashlight']::text[]),
  ('Zebralight', array['zebra light']::text[], array['Flashlight']::text[]),
  ('Malkoff', array['malkoff devices']::text[], array['Flashlight']::text[]),
  ('ThruNite', array['thru nite']::text[], array['Flashlight']::text[]),
  ('Skilhunt', array['skill hunt']::text[], array['Flashlight']::text[]),
  ('Convoy', '{}'::text[], array['Flashlight']::text[]),
  ('Armytek', array['army tek']::text[], array['Flashlight']::text[]),
  ('Reylight', array['rey light']::text[], array['Flashlight']::text[]),
  ('Prometheus Lights', array['prometheus']::text[], array['Flashlight']::text[]),
  ('Peak', array['peak led solutions']::text[], array['Flashlight']::text[]),
  ('Manker', '{}'::text[], array['Flashlight']::text[]),
  ('Klarus', '{}'::text[], array['Flashlight']::text[]),
  ('Fireflies', array['fireflylite','ff']::text[], array['Flashlight']::text[]),
  ('Rovyvon', '{}'::text[], array['Flashlight']::text[]),
  ('Imalent', '{}'::text[], array['Flashlight']::text[]),
  ('Ledlenser', array['led lenser']::text[], array['Flashlight']::text[]),
  ('Maglite', array['mag lite','mag-lite']::text[], array['Flashlight']::text[]),
  ('Modlite', '{}'::text[], array['Flashlight']::text[]),
  ('Cloud Defensive', '{}'::text[], array['Flashlight']::text[]),
  ('Jetbeam', array['jet beam']::text[], array['Flashlight']::text[]),
  ('Weltool', '{}'::text[], array['Flashlight']::text[]),
  ('Folomov', '{}'::text[], array['Flashlight']::text[]),
  ('Nightwatch', array['night watch']::text[], array['Flashlight']::text[]),
  ('Lumens Factory', '{}'::text[], array['Flashlight']::text[]),
  ('Tactile Turn', '{}'::text[], array['Pen']::text[]),
  ('Big Idea Design', array['bigidesign','big i design','bid']::text[], array['Pen','Keychain']::text[]),
  ('Fisher Space Pen', array['fisher','space pen']::text[], array['Pen']::text[]),
  ('Zebra', array['zebra pen']::text[], array['Pen']::text[]),
  ('Pilot', '{}'::text[], array['Pen']::text[]),
  ('Parker', '{}'::text[], array['Pen']::text[]),
  ('Rotring', array['rotring']::text[], array['Pen']::text[]),
  ('Lamy', '{}'::text[], array['Pen']::text[]),
  ('Kaweco', '{}'::text[], array['Pen']::text[]),
  ('Schon DSGN', array['schon design','schon']::text[], array['Pen']::text[]),
  ('Machine Era', '{}'::text[], array['Pen']::text[]),
  ('Ti2 Design', array['ti2','ti 2']::text[], array['Pen','Keychain']::text[]),
  ('Karas Pen Co', array['karas kustoms','karas']::text[], array['Pen']::text[]),
  ('Bastion', array['bastion pen']::text[], array['Pen']::text[]),
  ('Rite in the Rain', '{}'::text[], array['Pen']::text[]),
  ('Uni-ball', array['uniball','uni ball','uni']::text[], array['Pen']::text[]),
  ('Pentel', '{}'::text[], array['Pen']::text[]),
  ('Cross', array['a.t. cross']::text[], array['Pen']::text[]),
  ('Montblanc', array['mont blanc']::text[], array['Pen']::text[]),
  ('Tool Logic', '{}'::text[], array['Multi-tool']::text[]),
  ('Fixit Sticks', '{}'::text[], array['Multi-tool']::text[]),
  ('Nite Ize', array['niteize']::text[], array['Keychain','Multi-tool']::text[]),
  ('KeyBar', array['key bar']::text[], array['Keychain']::text[]),
  ('KeySmart', array['key smart']::text[], array['Keychain']::text[]),
  ('Orbitkey', array['orbit key']::text[], array['Keychain']::text[]),
  ('Dango', array['dango products']::text[], array['Wallet','Multi-tool']::text[]),
  ('Ridge', array['the ridge','ridge wallet']::text[], array['Wallet']::text[]),
  ('Bellroy', array['bell roy']::text[], array['Wallet']::text[]),
  ('Trayvax', '{}'::text[], array['Wallet']::text[]),
  ('Ekster', '{}'::text[], array['Wallet']::text[]),
  ('Secrid', '{}'::text[], array['Wallet']::text[]),
  ('Saddleback Leather', array['saddleback']::text[], array['Wallet']::text[]),
  ('Casio', '{}'::text[], array['Watch']::text[]),
  ('G-Shock', array['gshock','g shock']::text[], array['Watch']::text[]),
  ('Seiko', '{}'::text[], array['Watch']::text[]),
  ('Timex', '{}'::text[], array['Watch']::text[]),
  ('Garmin', '{}'::text[], array['Watch']::text[]),
  ('Citizen', '{}'::text[], array['Watch']::text[]),
  ('Orient', '{}'::text[], array['Watch']::text[]),
  ('Hamilton', '{}'::text[], array['Watch']::text[]),
  ('Tissot', '{}'::text[], array['Watch']::text[]),
  ('Luminox', '{}'::text[], array['Watch']::text[]),
  ('Marathon', array['marathon watch']::text[], array['Watch']::text[]),
  ('Rolex', '{}'::text[], array['Watch']::text[]),
  ('Omega', '{}'::text[], array['Watch']::text[]),
  ('Tudor', '{}'::text[], array['Watch']::text[]),
  ('Apple', array['apple watch']::text[], array['Watch']::text[]),
  ('Suunto', '{}'::text[], array['Watch']::text[]),
  ('Bertucci', '{}'::text[], array['Watch']::text[])
on conflict (key) do nothing;

notify pgrst, 'reload schema';
