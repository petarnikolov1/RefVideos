-- BG Referee Watch — match sheets (squads and the refereeing team) from ebfu.net
-- Run after football-setup.sql and refs-setup.sql. Safe to run again.
--
-- The Edge Function "sheets-sync" (supabase/functions/sheets-sync) reads ebfu.net, the Bulgarian Football Union's
-- electronic championship (БФС Електронно първенство), for efbet Лига, Втора лига and the Third League South-West: each
-- match's sheet — the starting elevens with shirt numbers (goalkeeper and captain marked), the substitutes, the head
-- coaches, and the refereeing team (referee, assistants, fourth official, VAR, AVAR, the BFU delegate, the referee
-- observer). The clubs fill the teams in about an hour or two before kick-off.
--
-- One scheduled job:
--   sheets-sync  every 10 minutes (:03, :13 …) — the matches around now, then the season's earlier ones without a sheet

create table if not exists public.match_sheets (
  match_id    text primary key references public.football_matches(id) on delete cascade,
  league      text not null,                 -- efbet | mrbit | sw3
  kickoff     timestamptz,
  ebfu_id     text,                          -- ebfu.net's code of the match (showMatchBtn)
  found       boolean not null default false,  -- paired with a match on ebfu.net
  complete    boolean not null default false,  -- both teams have their eleven
  home        jsonb,                         -- { name, town, coach, xi: [{ n, name, gk?, cap? }], subs: [...] }
  away        jsonb,
  officials   jsonb not null default '[]'::jsonb,   -- [{ r: 'ГС' | 'АС1' | 'АС2' | '4-ТИ' | 'ВАР' | 'АВАР' | 'ДЕЛЕГАТ' | 'СН', role, n, town }]
  stadium     text,
  competition text,                          -- "efbet Лига - 15 Кръг, Събота 21, Ное 2026 г. 14:45 часа"
  tries       smallint not null default 0,   -- times not found on ebfu.net
  fetched_at  timestamptz,
  updated_at  timestamptz not null default now()
);
create index if not exists match_sheets_league_idx on public.match_sheets (league, kickoff desc);
alter table public.match_sheets enable row level security;
drop policy if exists "match_sheets: public read" on public.match_sheets;
create policy "match_sheets: public read" on public.match_sheets for select using (true);
-- (written only by sheets-sync, with the service key)

-- the season's earlier matches still without a sheet (or not found, tried again once a day, three times), newest first
create or replace function public.sheets_backfill(p_limit int)
returns table (id text, league text, kickoff timestamptz, home_name text, away_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.league, m.kickoff, m.home_name, m.away_name
  from public.football_matches m left join public.match_sheets s on s.match_id = m.id
  where m.league in ('efbet', 'mrbit', 'sw3') and m.kickoff < now() - interval '6 hours' and m.kickoff > now() - interval '200 days'
    and (s.match_id is null or (not s.found and s.tries < 3 and s.fetched_at < now() - interval '1 day'))
  order by m.kickoff desc
  limit greatest(1, least(p_limit, 40));
$$;
revoke all on function public.sheets_backfill(int) from public, anon, authenticated;

-- the schedule (the same key as football-sync, in the vault as football_sync_key); run in Frankfurt, near ebfu.net
select cron.unschedule('sheets-sync') where exists (select 1 from cron.job where jobname = 'sheets-sync');
select cron.schedule('sheets-sync', '3-59/10 * * * *', $$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/sheets-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000)
$$);

-- to read a few matches and see the result without saving:
--   select net.http_post(url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/sheets-sync',
--     headers := jsonb_build_object('Content-Type','application/json','x-sync-key',
--       (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
--     body := '{"ids": ["efbet:fb-m-534555"], "dry": true}'::jsonb, timeout_milliseconds := 150000);
