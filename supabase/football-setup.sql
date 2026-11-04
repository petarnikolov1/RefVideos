-- BG Referee Watch — Results & Table (efbet Лига and Mr Bit Втора лига)
-- Already applied to the RefVideos Supabase project. Safe to run again.
--
-- What it creates
--   football_matches    every match of the season: round, kickoff, teams, logos, score, half-time,
--                       and the short / extended YouTube report once found (readable by everyone)
--   football_standings  the league tables (readable by everyone)
--   football_rounds     each round's "Обзор на кръга" (Diema's round review, uploaded by Gong.bg to YouTube)
--   private.football_sync_log   what each sync run did
--   two scheduled jobs that call the Edge Function "football-sync" (supabase/functions/football-sync):
--     football-results  at :02 and :32 every hour — results, fixtures, tables, and up to 3 round-review searches
--     football-videos   every 5 minutes — looks for the reports of up to 10 played matches
--
-- Deploy the Edge Function with JWT verification OFF; it checks its own key instead
-- (the vault secret "football_sync_key", created below and sent by the jobs as x-sync-key).

create extension if not exists pg_net with schema extensions;   -- its functions live in the "net" schema
create extension if not exists pg_cron;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.football_matches (
  id                text primary key,
  league            text not null check (league in ('efbet', 'mrbit')),
  season            text not null,
  round             int  not null,
  kickoff           timestamptz,
  status            text not null default 'scheduled',
  home_name         text not null,
  away_name         text not null,
  home_logo         text,
  away_logo         text,
  home_score        int,
  away_score        int,
  ht_home           int,
  ht_away           int,
  short_video       jsonb,          -- {id, title, length, seconds, channel, embed}
  long_video        jsonb,          -- short_video / long_video are always Gong.bg's reports
  other_videos      jsonb,          -- every report from other channels, up to 12 (null = not looked for yet)
  video_tries       int not null default 0,
  videos_checked_at timestamptz,
  source_url        text,
  updated_at        timestamptz not null default now()
);
alter table public.football_matches add column if not exists other_videos jsonb;
create index if not exists football_matches_round_idx on public.football_matches (league, season, round);
create index if not exists football_matches_queue_idx on public.football_matches (status, videos_checked_at);
alter table public.football_matches enable row level security;
drop policy if exists "football matches: public read" on public.football_matches;
create policy "football matches: public read" on public.football_matches for select using (true);

create table if not exists public.football_standings (
  league        text not null,
  season        text not null,
  team_name     text not null,
  rank          int,
  logo          text,
  played        int, won int, drawn int, lost int,
  goals_for     int, goals_against int,
  points        int,
  form          text,             -- last results, oldest → newest (W/D/L)
  updated_at    timestamptz not null default now(),
  primary key (league, season, team_name)
);
alter table public.football_standings enable row level security;
drop policy if exists "football standings: public read" on public.football_standings;
create policy "football standings: public read" on public.football_standings for select using (true);

create table if not exists public.football_rounds (
  league     text not null,
  season     text not null,
  round      int  not null,
  review     jsonb,                       -- Gong.bg's "Обзор на кръга" video for the round
  tries      int  not null default 0,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (league, season, round)
);
alter table public.football_rounds enable row level security;
drop policy if exists "football_rounds: public read" on public.football_rounds;
create policy "football_rounds: public read" on public.football_rounds for select using (true);

create schema if not exists private;
create table if not exists private.football_sync_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  details jsonb
);

-- ───────────────────────── a changed score means the videos must be found again ─────────────────────────
create or replace function private.football_score_changed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.home_score is not null and (new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score)) then
    new.short_video := null; new.long_video := null; new.other_videos := null; new.video_tries := 0; new.videos_checked_at := null;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists football_score_changed on public.football_matches;
create trigger football_score_changed before update on public.football_matches
  for each row execute function private.football_score_changed();

-- ───────────────────────── sync key ─────────────────────────
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'football_sync_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'football_sync_key', 'key for the football-sync job');
  end if;
end $$;

-- ───────────────────────── helpers used by the Edge Function (service role only) ─────────────────────────
create or replace function public.football_sync_key_ok(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'football_sync_key' and decrypted_secret = k);
$$;

-- played matches to look at: a saved video not checked yet ("playable on other sites?") or not from Gong,
-- other channels' reports not collected yet (one search), or a Gong report (short or extended, both leagues)
-- still missing — retried after 3 h, 12 h, 1 day, then every 3 days while the match is under 10 days old
-- (up to 8 tries); an older match is searched once
create or replace function public.football_video_queue(n int) returns setof public.football_matches
language sql stable security definer set search_path = '' as $$
  select * from public.football_matches m
  where m.status = 'finished' and m.kickoff < now() - interval '2 hours'
    and (
      (m.short_video is not null and (not (m.short_video ? 'embed') or coalesce(m.short_video->>'channel', '') !~* 'gong'))
      or (m.long_video is not null and (not (m.long_video ? 'embed') or coalesce(m.long_video->>'channel', '') !~* 'gong'))
      or m.other_videos is null
      or ((m.short_video is null or m.long_video is null)
          and m.video_tries < case when m.kickoff < now() - interval '10 days' then 1 else 8 end
          and (m.videos_checked_at is null or m.videos_checked_at < now() - case least(m.video_tries, 4)
                when 0 then interval '0' when 1 then interval '3 hours' when 2 then interval '12 hours' when 3 then interval '1 day' else interval '3 days' end))
    )
  order by m.videos_checked_at nulls first, m.kickoff desc
  limit greatest(0, least(n, 80));
$$;

-- update the table rows (never deletes; ignores an answer with fewer than 4 teams)
create or replace function public.football_replace_standings(p_league text, p_season text, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 4 then return 0; end if;
  insert into public.football_standings as s (league, season, team_name, rank, logo, played, won, drawn, lost, goals_for, goals_against, points, form, updated_at)
  select p_league, p_season, r->>'team_name', (r->>'rank')::int, r->>'logo', (r->>'played')::int, (r->>'won')::int, (r->>'drawn')::int, (r->>'lost')::int,
         (r->>'goals_for')::int, (r->>'goals_against')::int, (r->>'points')::int, r->>'form', now()
  from jsonb_array_elements(p_rows) r where coalesce(r->>'team_name', '') <> ''
  on conflict (league, season, team_name) do update set rank = excluded.rank, logo = excluded.logo, played = excluded.played, won = excluded.won,
    drawn = excluded.drawn, lost = excluded.lost, goals_for = excluded.goals_for, goals_against = excluded.goals_against,
    points = excluded.points, form = excluded.form, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end; $$;

-- every round of the season with its dates: first kickoff and when most of it (80%) has been played
create or replace function public.football_round_info(p_season text)
returns table(league text, round int, first_kickoff timestamptz, main_end timestamptz, played int, total int,
              has_review boolean, tries int, checked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with r as (
    select m.league, m.round, min(m.kickoff) first_kickoff,
           percentile_disc(0.8) within group (order by m.kickoff) main_end,
           count(*) filter (where m.home_score is not null)::int played, count(*)::int total
    from public.football_matches m
    where m.season = p_season and m.kickoff is not null and m.round is not null
    group by m.league, m.round)
  select r.league, r.round, r.first_kickoff, r.main_end, r.played, r.total,
         (f.review is not null), coalesce(f.tries, 0), f.checked_at
  from r left join public.football_rounds f on f.league = r.league and f.season = p_season and f.round = r.round
  order by r.league, r.round;
$$;

create or replace function public.football_log(details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into private.football_sync_log (details) values (details);
$$;

revoke execute on function public.football_sync_key_ok(text) from public, anon, authenticated;
revoke execute on function public.football_video_queue(int) from public, anon, authenticated;
revoke execute on function public.football_replace_standings(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.football_log(jsonb) from public, anon, authenticated;
revoke execute on function public.football_round_info(text) from public, anon, authenticated;
grant execute on function public.football_sync_key_ok(text) to service_role;
grant execute on function public.football_video_queue(int) to service_role;
grant execute on function public.football_replace_standings(text, text, jsonb) to service_role;
grant execute on function public.football_log(jsonb) to service_role;
grant execute on function public.football_round_info(text) to service_role;

-- ───────────────────────── schedule ─────────────────────────
-- For another project, change the address to https://<project-ref>.supabase.co/functions/v1/football-sync
select cron.schedule('football-results', '2,32 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/football-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"results": true, "rounds": 3, "videos": 0}'::jsonb,
    timeout_milliseconds := 90000);
$job$);

select cron.schedule('football-videos', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/football-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"results": false, "videos": 10}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
