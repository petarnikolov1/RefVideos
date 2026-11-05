-- BG Referee Watch — world competitions on the Results page
-- (the five big leagues, Champions League, Europa League, Conference League and the national-team competitions)
-- Already applied to the RefVideos Supabase project. Run after football-setup.sql. Safe to run again.
--
-- The Edge Function "world-sync" (supabase/functions/world-sync) reads ESPN's public scoreboard and standings and
-- saves them next to the Bulgarian leagues: football_matches / football_standings with league = ESPN's key
-- (eng.1, esp.1, ita.1, ger.1, fra.1, uefa.champions, uefa.europa, uefa.europa.conf, fifa.world, uefa.euro,
-- conmebol.america, caf.nations, uefa.nations and the qualifiers). football_competitions lists them and says which
-- are being played now; the page lists national-team competitions only while they (or their qualifiers) are played.
--
-- Two scheduled jobs:
--   world-results  at :12 and :42 every hour — last, this and next month of every competition, and the tables
--   world-season   daily at 04:20 UTC        — every month of the current season of the competitions being played

-- the Bulgarian video and round-review jobs only look at the Bulgarian leagues
create or replace function public.football_video_queue(n int) returns setof public.football_matches
language sql stable security definer set search_path = '' as $$
  select * from public.football_matches m
  where m.league in ('efbet', 'mrbit') and m.status = 'finished' and m.kickoff < now() - interval '2 hours'
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

create or replace function public.football_round_info(p_season text)
returns table(league text, round int, first_kickoff timestamptz, main_end timestamptz, played int, total int,
              has_review boolean, tries int, checked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with r as (
    select m.league, m.round, min(m.kickoff) first_kickoff,
           percentile_disc(0.8) within group (order by m.kickoff) main_end,
           count(*) filter (where m.home_score is not null)::int played, count(*)::int total
    from public.football_matches m
    where m.season = p_season and m.league in ('efbet', 'mrbit') and m.kickoff is not null and m.round is not null
    group by m.league, m.round)
  select r.league, r.round, r.first_kickoff, r.main_end, r.played, r.total,
         (f.review is not null), coalesce(f.tries, 0), f.checked_at
  from r left join public.football_rounds f on f.league = r.league and f.season = p_season and f.round = r.round
  order by r.league, r.round;
$$;

-- any competition, not only efbet / mrbit; a stage / group per match and a group per table row
alter table public.football_matches drop constraint if exists football_matches_league_check;
alter table public.football_matches add column if not exists round_name text;   -- ESPN's stage, e.g. league-phase, round-of-16
alter table public.football_matches add column if not exists note text;         -- group or stage, e.g. "Група C2", "1/8-финал · реванш"
alter table public.football_standings add column if not exists grp text;
alter table public.football_standings add column if not exists grp_order int;

-- which competitions exist and which are being played now
create table if not exists public.football_competitions (
  key        text primary key,               -- ESPN slug, e.g. eng.1, uefa.champions, uefa.nations
  name       text not null,                  -- Bulgarian name
  grp        text not null,                  -- top5 | euro | nat
  ord        int  not null default 0,
  season     text,                           -- current edition, e.g. "2026-27 English Premier League"
  active     boolean not null default false, -- a match in the last 6 weeks or the next 6 weeks
  first_match timestamptz,
  last_match  timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.football_competitions enable row level security;
drop policy if exists "football_competitions: public read" on public.football_competitions;
create policy "football_competitions: public read" on public.football_competitions for select using (true);

-- update a competition's table (keeps group names; never deletes; ignores an empty answer)
create or replace function public.football_replace_standings(p_league text, p_season text, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 2 then return 0; end if;
  insert into public.football_standings as s (league, season, team_name, rank, logo, played, won, drawn, lost, goals_for, goals_against, points, form, grp, grp_order, updated_at)
  select p_league, p_season, r->>'team_name', (r->>'rank')::int, r->>'logo', (r->>'played')::int, (r->>'won')::int, (r->>'drawn')::int, (r->>'lost')::int,
         (r->>'goals_for')::int, (r->>'goals_against')::int, (r->>'points')::int, r->>'form', r->>'grp', (r->>'grp_order')::int, now()
  from jsonb_array_elements(p_rows) r where coalesce(r->>'team_name', '') <> ''
  on conflict (league, season, team_name) do update set rank = excluded.rank, logo = excluded.logo, played = excluded.played, won = excluded.won,
    drawn = excluded.drawn, lost = excluded.lost, goals_for = excluded.goals_for, goals_against = excluded.goals_against,
    points = excluded.points, form = excluded.form, grp = excluded.grp, grp_order = excluded.grp_order, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end; $$;

-- ───────────────────────── schedule ─────────────────────────
-- For another project, change the address to https://<project-ref>.supabase.co/functions/v1/world-sync
select cron.schedule('world-results', '12,42 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/world-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000);
$job$);

select cron.schedule('world-season', '20 4 * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/world-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"season": true}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
