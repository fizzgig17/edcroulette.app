-- EDC Roulette in the owner dashboard (Belay Buddy's dashboard.belaybuddy.app).
--
-- The dashboard is shared: the same admins (public.admins), the same two-step
-- sign-in, the same Prod/Dev switch. Its "EDC Roulette" tab calls the functions
-- below. Each one starts with public.dash_guard() (must be an admin AND signed
-- in with an authenticator code), so nobody else gets anything. They live in the
-- edc schema because EDC owns them; Belay Buddy's migrations stay out of it.
--
--   edc.dash_edc_counts()    how many brand suggestions are waiting (tab badge)
--   edc.dash_edc_overview()  brands by status and 14 days of usage
--   edc.dash_brands()        brands by status, with close matches for the waiting ones
--   edc.dash_review_brand()  approve (optionally fixing name, aliases, categories),
--                            reject, restore, or merge a typo into an existing brand

create function edc.dash_edc_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.dash_guard();
  return jsonb_build_object('edc_brands', (select count(*) from edc.brands where status = 'pending'));
end;
$$;

create function edc.dash_edc_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  perform public.dash_guard();
  return jsonb_build_object(
    'brands', jsonb_build_object(
      'approved', (select count(*) from edc.brands where status = 'approved'),
      'pending', (select count(*) from edc.brands where status = 'pending'),
      'rejected', (select count(*) from edc.brands where status = 'rejected')),
    'suggestions_7d', (select count(*) from edc.brand_suggestion_log where created_at > now() - interval '7 days'),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d.day::date,
               'identify', coalesce(u.identify, 0),
               'identify_phones', coalesce(u.identify_phones, 0),
               'pair', coalesce(u.pair, 0),
               'pair_phones', coalesce(u.pair_phones, 0)) order by d.day), '[]')
      from generate_series(today - 13, today, interval '1 day') as d(day)
      left join (
        select day,
               coalesce(sum(count) filter (where bucket = 'all'), 0) as identify,
               count(*) filter (where bucket like 'device:%') as identify_phones,
               coalesce(sum(count) filter (where bucket = 'pair-all'), 0) as pair,
               count(*) filter (where bucket like 'pair-device:%') as pair_phones
        from edc.identify_usage
        group by day
      ) u on u.day = d.day::date));
end;
$$;

-- p_status: pending | approved | rejected | all
create function edc.dash_brands(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.dash_guard();
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.suggested_count desc, t.created_at desc)
    from (
      select b.id, b.name, b.aliases, b.categories, b.status, b.suggested_count, b.created_at, b.reviewed_at,
             case when b.status = 'approved' then '[]'::jsonb else coalesce((
               select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'score', round(m.score::numeric, 2)))
               from edc.match_brands(b.name, 3) m
               join edc.brands a on a.name = m.name and a.status = 'approved'
               where m.score >= 0.5), '[]'::jsonb) end as similar
      from edc.brands b
      where p_status = 'all' or b.status = p_status
      order by b.suggested_count desc, b.created_at desc
      limit 300
    ) t), '[]');
end;
$$;

-- p_action: approve | reject | restore | merge
--   approve  p_name, p_aliases, p_categories optionally fix the entry as it is approved
--   merge    adds the name (and its aliases) to the existing brand p_into as aliases and
--            removes this entry, so a misspelling maps to the right brand from then on
create function edc.dash_review_brand(
  p_id uuid,
  p_action text,
  p_name text default null,
  p_aliases text[] default null,
  p_categories text[] default null,
  p_into uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b edc.brands;
  target edc.brands;
  new_aliases text[];
begin
  perform public.dash_guard();
  select * into b from edc.brands where id = p_id for update;
  if not found then raise exception 'No such brand'; end if;

  if p_action = 'approve' then
    update edc.brands
       set status = 'approved',
           name = coalesce(nullif(btrim(p_name), ''), name),
           aliases = coalesce(p_aliases, aliases),
           categories = coalesce(p_categories, categories),
           reviewed_at = now()
     where id = p_id;
  elsif p_action = 'reject' then
    update edc.brands set status = 'rejected', reviewed_at = now() where id = p_id;
  elsif p_action = 'restore' then
    update edc.brands set status = 'pending', reviewed_at = null where id = p_id;
  elsif p_action = 'merge' then
    if p_into is null or p_into = p_id then raise exception 'Pick the brand to merge into'; end if;
    select * into target from edc.brands where id = p_into and status = 'approved' for update;
    if not found then raise exception 'Merge into an approved brand'; end if;
    select coalesce(array_agg(distinct a), '{}') into new_aliases
      from unnest(target.aliases || array[b.name] || b.aliases) a
     where edc.brand_key(a) <> target.key and edc.brand_key(a) <> '';
    update edc.brands set aliases = new_aliases, reviewed_at = now() where id = p_into;
    delete from edc.brands where id = p_id;
  else
    raise exception 'Unknown action';
  end if;
exception when unique_violation then
  raise exception 'A brand with that name already exists';
end;
$$;

revoke execute on function edc.dash_edc_counts(), edc.dash_edc_overview(), edc.dash_brands(text),
  edc.dash_review_brand(uuid, text, text, text[], text[], uuid) from public, anon;
grant execute on function edc.dash_edc_counts(), edc.dash_edc_overview(), edc.dash_brands(text),
  edc.dash_review_brand(uuid, text, text, text[], text[], uuid) to authenticated;
