-- Live results and tables: while matches are being played, their results are read every few minutes
-- (the regular jobs run every 30 minutes). Run once in the SQL editor, after football-setup.sql, world-setup.sql
-- and refs-setup.sql. The job only calls a sync when one of its matches is on:
--   efbet Лига      every 2 minutes from kick-off until efbetleague.com says it's over (at most 3 hours) — live scores
--   world           every 2 minutes, only the competitions with a match on (ESPN) — live scores
--   Втора лига      every 6 minutes for 4 hours after kick-off (mr-bit.bg shows results only once a match is over,
--                   and turns away visitors who come too often)
--   Трета лига      every 10 minutes for 8 hours after kick-off (bulgarian-football.com posts results after the
--                   matches; many have no kick-off time and count from noon)
-- The page (public/table.js) adds the matches being played to the table at their current score, and reads the
-- results again every minute while a match of the league on screen is on.

select cron.schedule('football-live', '*/2 * * * *', $job$
  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/football-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"results": true, "leagues": ["efbet"], "rounds": 0, "videos": 0, "live": true}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.football_matches where league = 'efbet' and status in ('scheduled', 'live')
                  and kickoff between now() - interval '3 hours' and now() + interval '2 minutes');

  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/world-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := jsonb_build_object('live', true, 'only', x.keys),
    timeout_milliseconds := 60000)
  from (select jsonb_agg(distinct league) keys from public.football_matches
         where league not in ('efbet', 'mrbit', 'sw3') and status in ('scheduled', 'live')
           and kickoff between now() - interval '3 hours' and now() + interval '2 minutes') x
  where x.keys is not null;

  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/football-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"results": true, "leagues": ["mrbit"], "rounds": 0, "videos": 0, "live": true}'::jsonb,
    timeout_milliseconds := 60000)
  where extract(minute from now())::int % 6 = 0
    and exists (select 1 from public.football_matches where league = 'mrbit' and status = 'scheduled'
                  and kickoff between now() - interval '4 hours' and now());

  select net.http_post(
    url := 'https://zinuspouctowujhocevy.supabase.co/functions/v1/refs-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_key')),
    body := '{"officials": false, "discipline": false}'::jsonb,
    timeout_milliseconds := 90000)
  where extract(minute from now())::int % 10 = 0
    and exists (select 1 from public.football_matches where league = 'sw3' and status = 'scheduled'
                  and kickoff between now() - interval '8 hours' and now());
$job$);
