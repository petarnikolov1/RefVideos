-- What happened in each First and Second League match (goals, cards, substitutions, VAR reviews, each with its
-- minute), read by refs-sync from bulgarian-football.com's statistics; and where each half starts in a club's
-- full-match recording on ebfu.net, marked by members, so the minutes lead to the right moment of the recording.

create table if not exists public.match_events (
  match_id   text primary key references public.football_matches(id) on delete cascade,
  league     text not null,
  round      int,
  source     text,                       -- the statistics page and the match's anchor
  events     jsonb not null default '[]', -- [{ k, min, m, x, h, side, n, p, p2, s, why, v, what, first, final, … }]
  stop       int[],                      -- each half's added time, in minutes
  codes      text[],                     -- the statistics' codes for the home and away team
  updated_at timestamptz not null default now()
);
alter table public.match_events enable row level security;
drop policy if exists "match events: public read" on public.match_events;
create policy "match events: public read" on public.match_events for select using (true);
revoke insert, update, delete, truncate on public.match_events from anon, authenticated;

create table if not exists public.recording_marks (
  rec        text primary key,            -- '<league>|<match id>|home' or '…|away': whose recording
  match_id   text not null references public.football_matches(id) on delete cascade,
  k1         real check (k1 is null or k1 >= 0),   -- seconds into the recording where the first half starts
  k2         real check (k2 is null or k2 >= 0),   -- … and the second half
  set_by     uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.recording_marks enable row level security;
drop policy if exists "recording marks: approved members read" on public.recording_marks;
drop policy if exists "recording marks: approved members add" on public.recording_marks;
drop policy if exists "recording marks: approved members change" on public.recording_marks;
create policy "recording marks: approved members read" on public.recording_marks for select to authenticated using (private.is_approved());
create policy "recording marks: approved members add" on public.recording_marks for insert to authenticated with check (private.is_approved());
create policy "recording marks: approved members change" on public.recording_marks for update to authenticated using (private.is_approved()) with check (private.is_approved());
revoke delete, truncate on public.recording_marks from anon, authenticated;

-- stats-sync every 15 minutes (the rounds of the last four days, and finished matches still without events), and once a
-- night every round of the season again (the site fills in older matches late)
select cron.unschedule(jobid) from cron.job where jobname in ('stats-sync', 'stats-sync-all');
select cron.schedule('stats-sync', '9-59/15 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/stats-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$job$);
select cron.schedule('stats-sync-all', '17 4 * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/stats-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"all": true}'::jsonb,
    timeout_milliseconds := 150000)
$job$);
