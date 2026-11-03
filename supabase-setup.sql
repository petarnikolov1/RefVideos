-- BG Referee Watch — Supabase setup
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run again (everything is "create if missing" / "replace").
--
-- What it creates
--   profiles       one row per registered user; new users start as NOT approved
--   videos         clips uploaded by approved users; readable by everyone
--   article_reads  per-user read marks for news articles
--   storage bucket "videos" (public read, upload only by approved users into their own folder)
--
-- After running it: register on the site with your own email, then run the line at the very bottom
-- (with your email) to make yourself the admin.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (approved or role = 'admin'));
$$;

-- create the profile automatically when someone registers
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────── videos ─────────────────────────
create table if not exists public.videos (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  uploaded_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uploader_name text,
  title         text not null check (char_length(title) between 3 and 200),
  match         text,
  match_date    date,
  minutes       text,
  division      text,
  description   text,
  article_key   text,          -- links the clip to a news story on the site
  article_url   text,
  storage_path  text,          -- file in the "videos" bucket …
  video_url     text,          -- … or a YouTube / Facebook / Vimeo / Vbox7 link
  constraint video_source check (storage_path is not null or video_url is not null)
);
create index if not exists videos_article_key_idx on public.videos (article_key);
alter table public.videos enable row level security;

-- uploader id and name are always set by the database, never trusted from the browser
create or replace function public.videos_set_uploader() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.uploaded_by   := auth.uid();
  new.uploader_name := (select display_name from public.profiles where id = auth.uid());
  return new;
end; $$;
drop trigger if exists videos_set_uploader on public.videos;
create trigger videos_set_uploader before insert on public.videos
  for each row execute function public.videos_set_uploader();

drop policy if exists "videos: public read" on public.videos;
create policy "videos: public read" on public.videos for select using (true);

drop policy if exists "videos: approved users insert" on public.videos;
create policy "videos: approved users insert" on public.videos
  for insert to authenticated with check (public.is_approved());

drop policy if exists "videos: owner or admin update" on public.videos;
create policy "videos: owner or admin update" on public.videos
  for update to authenticated using (uploaded_by = auth.uid() or public.is_admin());

drop policy if exists "videos: owner or admin delete" on public.videos;
create policy "videos: owner or admin delete" on public.videos
  for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());

-- ───────────────────────── read marks ─────────────────────────
create table if not exists public.article_reads (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_key text not null,
  read_at     timestamptz not null default now(),
  primary key (user_id, article_key)
);
alter table public.article_reads enable row level security;

drop policy if exists "reads: own rows" on public.article_reads;
create policy "reads: own rows" on public.article_reads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── storage bucket ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "videos bucket: public read" on storage.objects;
create policy "videos bucket: public read" on storage.objects
  for select using (bucket_id = 'videos');

drop policy if exists "videos bucket: approved upload to own folder" on storage.objects;
create policy "videos bucket: approved upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and public.is_approved() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "videos bucket: owner or admin delete" on storage.objects;
create policy "videos bucket: owner or admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ───────────────────────── make yourself admin ─────────────────────────
-- 1) Register on the website first.  2) Put your email below and run just this line.
-- update public.profiles set role = 'admin', approved = true where email = 'YOUR_EMAIL_HERE';
