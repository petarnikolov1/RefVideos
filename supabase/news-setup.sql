-- BG Referee Watch — saved news (Bulgaria / World tabs)
-- Already applied to the RefVideos Supabase project. Safe to run again (after football-setup.sql, which creates
-- the vault key "football_sync_key" and the check function football_sync_key_ok that news-sync also uses).
--
-- The Edge Function "news-sync" (supabase/functions/news-sync) searches Google News and Bing News and saves only
-- stories about refereeing here. The site just reads this table, so no browser searches anything any more.
--   news-recent    at :07 and :37 every hour — the last few days
--   news-backfill  every 6 minutes — one older 2-week window of the season per run; after the whole season it
--                  rests a day and then goes through it again, to pick up stories published or indexed late
-- found_at keeps the time a story was first found: the page marks stories found since a visitor's last visit as NEW.
-- Google refuses some Supabase server regions, so the jobs pin the function to London / N. Virginia (x-region).

create table if not exists public.news_articles (
  aid          text primary key,                 -- normalised headline + outlet (same key the page uses for read marks)
  title        text not null,
  link         text,
  descr        text not null default '',
  src          text,
  published_at timestamptz not null,
  found_at     timestamptz not null default now(),
  scope        text not null check (scope in ('bg', 'world')),
  divs         text[] not null default '{}',
  comps        text[] not null default '{}',
  cats         text[] not null default '{}',
  score        int not null default 1,
  hinted       boolean not null default false,
  clubs        text[] not null default '{}',
  vh           boolean not null default false,
  updated_at   timestamptz not null default now()
);
create index if not exists news_articles_published_idx on public.news_articles (published_at desc);
create index if not exists news_articles_found_idx on public.news_articles (found_at desc);
alter table public.news_articles enable row level security;
drop policy if exists "news: public read" on public.news_articles;
create policy "news: public read" on public.news_articles for select using (true);

create schema if not exists private;
create table if not exists private.news_state (k text primary key, v jsonb not null, updated_at timestamptz not null default now());
create table if not exists private.news_sync_log (id bigint generated always as identity primary key, at timestamptz not null default now(), details jsonb);

-- add found articles; an article already saved keeps its first-found time and gains any new information
create or replace function public.news_upsert(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with src as (
    select distinct on (r->>'aid')
      r->>'aid' aid, r->>'title' title, r->>'link' link, coalesce(r->>'descr', '') descr, r->>'src' src,
      (r->>'published_at')::timestamptz published_at, r->>'scope' scope,
      array(select jsonb_array_elements_text(coalesce(r->'divs', '[]'))) divs,
      array(select jsonb_array_elements_text(coalesce(r->'comps', '[]'))) comps,
      array(select jsonb_array_elements_text(coalesce(r->'cats', '[]'))) cats,
      array(select jsonb_array_elements_text(coalesce(r->'clubs', '[]'))) clubs,
      coalesce((r->>'score')::int, 1) score, coalesce((r->>'hinted')::boolean, false) hinted, coalesce((r->>'vh')::boolean, false) vh
    from jsonb_array_elements(p_rows) r
    where coalesce(r->>'aid', '') <> '' and coalesce(r->>'title', '') <> '' and r->>'scope' in ('bg', 'world')
    order by r->>'aid', (r->>'published_at')::timestamptz
  ), ins as (
    insert into public.news_articles as a (aid, title, link, descr, src, published_at, scope, divs, comps, cats, score, hinted, clubs, vh)
    select aid, title, link, descr, src, published_at, scope, divs, comps, cats, score, hinted, clubs, vh from src
    on conflict (aid) do update set
      descr = case when a.descr = '' then excluded.descr else a.descr end,
      published_at = least(a.published_at, excluded.published_at),
      divs = case when a.scope = 'bg' and not excluded.hinted and excluded.divs <> '{unk}'
               then (case when a.hinted then excluded.divs
                     else coalesce(nullif(array(select distinct x from unnest(a.divs || excluded.divs) x where x <> 'unk'), '{}'), '{unk}') end)
               else a.divs end,
      hinted = a.hinted and (excluded.hinted or excluded.divs = '{unk}'),
      comps = array(select distinct x from unnest(a.comps || excluded.comps) x),
      cats = coalesce(nullif(array(select distinct x from unnest(a.cats || excluded.cats) x where x <> 'other'), '{}'), '{other}'),
      clubs = array(select distinct x from unnest(a.clubs || excluded.clubs) x),
      score = greatest(a.score, excluded.score),
      vh = a.vh or excluded.vh,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into n from ins;
  return n;
end; $$;

create or replace function public.news_state_get(p_k text) returns jsonb
language sql stable security definer set search_path = '' as $$ select v from private.news_state where k = p_k; $$;
create or replace function public.news_state_set(p_k text, p_v jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into private.news_state (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v, updated_at = now();
$$;
create or replace function public.news_log(details jsonb) returns void
language sql security definer set search_path = '' as $$ insert into private.news_sync_log (details) values (details); $$;

revoke execute on function public.news_upsert(jsonb) from public, anon, authenticated;
revoke execute on function public.news_state_get(text) from public, anon, authenticated;
revoke execute on function public.news_state_set(text, jsonb) from public, anon, authenticated;
revoke execute on function public.news_log(jsonb) from public, anon, authenticated;
grant execute on function public.news_upsert(jsonb) to service_role;
grant execute on function public.news_state_get(text) to service_role;
grant execute on function public.news_state_set(text, jsonb) to service_role;
grant execute on function public.news_log(jsonb) to service_role;

-- ───────────────────────── schedule ─────────────────────────
-- For another project, change the address to https://<project-ref>.supabase.co/functions/v1/news-sync
select cron.schedule('news-recent', '7,37 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/news-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-west-2', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"recent": true}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
select cron.schedule('news-backfill', '*/6 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/news-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'us-east-1', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"backfill": true}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
