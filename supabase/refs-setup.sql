-- BG Referee Watch — referee appointments and the Third League South-West
-- Already applied to the RefVideos Supabase project. Run after football-setup.sql and world-setup.sql. Safe to run again.
--
-- The Edge Function "refs-sync" (supabase/functions/refs-sync) saves:
--   * the referee appointments of every match of efbet Лига, Mr Bit Втора лига (bfunion.bg → Съдийска комисия)
--     and the Third League South-West (bfu-tournaments.com → third-sw news) in football_officials, one row per match;
--   * the Third League South-West's results, fixtures and table (bulgarian-football.com) in football_matches /
--     football_standings with league = 'sw3';
--   * the Third League's disciplinary decisions (the PDF attached to each "Наказания Трета лига ЮЗГ" post) in
--     football_discipline: the suspended players and the fines and bans for clubs and staff.
--
-- One scheduled job:
--   refs-sync  at :25 and :55 every hour — the newest posts, and every post of the last 10 days again
--              (the committee sometimes changes an appointment), plus the Third League's results and table

-- the referee crew of a match: [{ r: 'ГС' | 'АС1' | 'АС2' | '4-ТИ' | 'ВАР' | 'АВАР' | 'СН' | 'ДН' | 'ДЕЛЕГАТ', n: 'Name' }]
create table if not exists public.football_officials (
  match_id     text primary key,              -- football_matches.id
  league       text not null,                 -- efbet | mrbit | sw3
  season       text not null,
  round        int,
  crew         jsonb not null default '[]'::jsonb,
  fixture      text,                          -- the fixture as the post writes it
  kickoff_text text,                          -- the date and time in the post, e.g. "2026-11-08 17:00"
  src_url      text,                          -- the post
  src_title    text,
  posted_at    timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists football_officials_league_season on public.football_officials (league, season);
alter table public.football_officials enable row level security;
drop policy if exists "football_officials: public read" on public.football_officials;
create policy "football_officials: public read" on public.football_officials for select using (true);

-- one row per punishments post: players [{ name, club, team, reason: yellow | red | report, detail, ban }],
-- decisions [{ section, text }] (fines and bans for clubs and staff)
create table if not exists public.football_discipline (
  url        text primary key,                -- the post
  league     text not null,                   -- sw3
  season     text not null,
  round      int,
  title      text,
  doc_url    text,                            -- the PDF
  posted_at  timestamptz,
  players    jsonb not null default '[]'::jsonb,
  decisions  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists football_discipline_league_season on public.football_discipline (league, season, round);
alter table public.football_discipline enable row level security;
drop policy if exists "football_discipline: public read" on public.football_discipline;
create policy "football_discipline: public read" on public.football_discipline for select using (true);

-- the schedule (uses the same key as football-sync, stored in the vault as football_sync_key)
select cron.unschedule('refs-sync') where exists (select 1 from cron.job where jobname = 'refs-sync');
select cron.schedule('refs-sync', '25,55 * * * *', $$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/refs-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000)
$$);

-- to read every post of the season again (e.g. after a change to the parser):
--   select net.http_post(url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/refs-sync',
--     headers := jsonb_build_object('Content-Type','application/json','x-sync-key',
--       (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
--     body := '{"pages": 3, "all": true}'::jsonb, timeout_milliseconds := 150000);
