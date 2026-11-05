-- BG Referee Watch — Supabase setup
-- Already applied to the RefVideos Supabase project (eu-central-1).
-- To set up a new project: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run again (everything is "create if missing" / "replace").
--
-- What it creates
--   profiles       one row per registered user; new users start as NOT approved
--   videos         clips added by approved members (uploaded files or links, Google Drive included); only approved
--                  members can see them. Each is Bulgarian or World and "approved by the Referee Committee" or not checked.
--   video_categories, video_category_items   the Laws-of-the-Game categories (kept by the admin) and which videos are in them
--   video_comments  comments on the videos, approved members only
--   article_reads  per-user read marks for news articles
--   storage bucket "videos" (private: approved members watch through signed links; upload only into their own folder)
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

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function private.is_approved() returns boolean
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
  for select to authenticated using (id = (select auth.uid()) or private.is_admin());

drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

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
  video_url     text,          -- … or a Google Drive / YouTube / Facebook / Vimeo / Vbox7 link
  constraint video_source check (storage_path is not null or video_url is not null)
);
alter table public.videos add column if not exists region text not null default 'bg';                 -- bg | world
alter table public.videos drop constraint if exists videos_region_check;
alter table public.videos add constraint videos_region_check check (region in ('bg', 'world'));
alter table public.videos add column if not exists review_status text not null default 'unchecked';   -- unchecked | approved (by the Referee Committee)
alter table public.videos drop constraint if exists videos_review_status_check;
alter table public.videos add constraint videos_review_status_check check (review_status in ('unchecked', 'approved'));
alter table public.videos add column if not exists committee_note text;                               -- the Referee Committee's comment
alter table public.videos drop constraint if exists videos_committee_note_check;
alter table public.videos add constraint videos_committee_note_check check (committee_note is null or char_length(committee_note) <= 4000);
alter table public.videos add column if not exists reviewed_at timestamptz;
alter table public.videos add column if not exists reviewed_by_name text;
create index if not exists videos_region_status_idx on public.videos (region, review_status, created_at desc);
create index if not exists videos_article_key_idx on public.videos (article_key);
create index if not exists videos_uploaded_by_idx on public.videos (uploaded_by);
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

-- only the admin sets the Referee Committee fields; nobody can change who uploaded a video
create or replace function public.videos_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.uploaded_by := old.uploaded_by; new.uploader_name := old.uploader_name; new.created_at := old.created_at;
  end if;
  if not private.is_admin() then
    if tg_op = 'INSERT' then
      new.review_status := 'unchecked'; new.committee_note := null; new.reviewed_at := null; new.reviewed_by_name := null;
    else
      new.review_status := old.review_status; new.committee_note := old.committee_note;
      new.reviewed_at := old.reviewed_at; new.reviewed_by_name := old.reviewed_by_name;
    end if;
  elsif tg_op = 'INSERT' or new.review_status is distinct from old.review_status or new.committee_note is distinct from old.committee_note then
    if new.review_status = 'approved' or new.committee_note is not null then
      new.reviewed_at := now(); new.reviewed_by_name := (select display_name from public.profiles where id = auth.uid());
    else
      new.reviewed_at := null; new.reviewed_by_name := null;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists videos_guard on public.videos;
create trigger videos_guard before insert or update on public.videos for each row execute function public.videos_guard();

drop policy if exists "videos: public read" on public.videos;
drop policy if exists "videos: approved members read" on public.videos;
create policy "videos: approved members read" on public.videos for select to authenticated using (private.is_approved());

drop policy if exists "videos: approved users insert" on public.videos;
create policy "videos: approved users insert" on public.videos
  for insert to authenticated with check (private.is_approved());

drop policy if exists "videos: owner or admin update" on public.videos;
create policy "videos: owner or admin update" on public.videos
  for update to authenticated using (uploaded_by = (select auth.uid()) or private.is_admin());

drop policy if exists "videos: owner or admin delete" on public.videos;
create policy "videos: owner or admin delete" on public.videos
  for delete to authenticated using (uploaded_by = (select auth.uid()) or private.is_admin());

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
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────────────────── comments on uploaded videos ─────────────────────────
-- approved members read and write; the author or an admin can delete
create table if not exists public.video_comments (
  id          bigint generated always as identity primary key,
  video_id    bigint not null references public.videos(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists video_comments_video_idx on public.video_comments (video_id, created_at);
create index if not exists video_comments_user_idx on public.video_comments (user_id);
alter table public.video_comments enable row level security;

create or replace function public.comments_set_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id     := auth.uid();
  new.author_name := (select display_name from public.profiles where id = auth.uid());
  return new;
end; $$;
drop trigger if exists comments_set_author on public.video_comments;
create trigger comments_set_author before insert on public.video_comments
  for each row execute function public.comments_set_author();

drop policy if exists "comments: public read" on public.video_comments;
drop policy if exists "comments: approved members read" on public.video_comments;
create policy "comments: approved members read" on public.video_comments for select to authenticated using (private.is_approved());
drop policy if exists "comments: approved members write" on public.video_comments;
create policy "comments: approved members write" on public.video_comments
  for insert to authenticated with check (private.is_approved());
drop policy if exists "comments: author or admin delete" on public.video_comments;
create policy "comments: author or admin delete" on public.video_comments
  for delete to authenticated using (user_id = (select auth.uid()) or private.is_admin());

-- ───────────────────────── video categories (Laws of the Game) ─────────────────────────
-- the admin adds, renames, orders and deletes categories; a video can be in several (copy) or be moved between them
create table if not exists public.video_categories (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists video_categories_name_idx on public.video_categories (lower(btrim(name)));
alter table public.video_categories enable row level security;
drop policy if exists "categories: approved members read" on public.video_categories;
create policy "categories: approved members read" on public.video_categories for select to authenticated using (private.is_approved());
drop policy if exists "categories: admin insert" on public.video_categories;
create policy "categories: admin insert" on public.video_categories for insert to authenticated with check (private.is_admin());
drop policy if exists "categories: admin update" on public.video_categories;
create policy "categories: admin update" on public.video_categories for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "categories: admin delete" on public.video_categories;
create policy "categories: admin delete" on public.video_categories for delete to authenticated using (private.is_admin());

create table if not exists public.video_category_items (
  video_id    bigint not null references public.videos(id) on delete cascade,
  category_id bigint not null references public.video_categories(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (video_id, category_id)
);
create index if not exists video_category_items_cat_idx on public.video_category_items (category_id);
alter table public.video_category_items enable row level security;
drop policy if exists "category items: approved members read" on public.video_category_items;
create policy "category items: approved members read" on public.video_category_items for select to authenticated using (private.is_approved());
-- the admin sorts every video; an approved uploader may file their own video when adding it
drop policy if exists "category items: admin or owner add" on public.video_category_items;
create policy "category items: admin or owner add" on public.video_category_items for insert to authenticated
  with check (private.is_admin() or (private.is_approved() and exists (select 1 from public.videos v where v.id = video_id and v.uploaded_by = (select auth.uid()))));
drop policy if exists "category items: admin or owner remove" on public.video_category_items;
create policy "category items: admin or owner remove" on public.video_category_items for delete to authenticated
  using (private.is_admin() or exists (select 1 from public.videos v where v.id = video_id and v.uploaded_by = (select auth.uid())));

insert into public.video_categories (name, sort)
select n, s from (values
  ('Offside', 10), ('Handball', 20), ('Serious foul play & violent conduct', 30), ('SPA & DOGSO', 40),
  ('Penalty-area incidents', 50), ('Careless, reckless & excessive-force challenges', 60), ('Holding & pulling', 70),
  ('Simulation', 80), ('Advantage', 90), ('Cautions & send-offs', 100), ('VAR interventions', 110),
  ('Game management', 120), ('Laws of the Game application', 130), ('Disputes & mass confrontations', 140),
  ('Positioning & movement', 150), ('Teamwork (assistants & 4th official)', 160), ('Other', 170)
) as d(n, s)
where not exists (select 1 from public.video_categories);

-- ───────────────────────── ebfu.net archive reports ─────────────────────────
-- structure reports of the ebfu.net video archive, sent by approved members; only admins can read them
create table if not exists public.ebfu_reports (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  report     jsonb not null
);
create index if not exists ebfu_reports_user_idx on public.ebfu_reports (user_id);
alter table public.ebfu_reports enable row level security;
drop policy if exists "ebfu reports: approved members send" on public.ebfu_reports;
create policy "ebfu reports: approved members send" on public.ebfu_reports
  for insert to authenticated with check (private.is_approved() and user_id = (select auth.uid()));
drop policy if exists "ebfu reports: admin reads" on public.ebfu_reports;
create policy "ebfu reports: admin reads" on public.ebfu_reports
  for select to authenticated using (private.is_admin());

-- ───────────────────────── storage bucket ─────────────────────────
-- 50 MB is the most the free plan allows per file; the site compresses bigger recordings in the browser first
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Private bucket: approved members watch the files through short-lived signed links.
drop policy if exists "videos bucket: public read" on storage.objects;
drop policy if exists "videos bucket: owner or admin read" on storage.objects;
drop policy if exists "videos bucket: approved members read" on storage.objects;
create policy "videos bucket: approved members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and private.is_approved());

drop policy if exists "videos bucket: approved upload to own folder" on storage.objects;
create policy "videos bucket: approved upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and private.is_approved() and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "videos bucket: owner or admin delete" on storage.objects;
create policy "videos bucket: owner or admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin()));

-- ───────────────────────── function permissions ─────────────────────────
-- trigger functions are internal; the two checks are only needed by logged-in users
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.videos_set_uploader() from public, anon, authenticated;
revoke execute on function public.comments_set_author() from public, anon, authenticated;
revoke execute on function public.videos_guard() from public, anon, authenticated;
revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.is_approved() from public, anon;
drop function if exists public.is_admin();
drop function if exists public.is_approved();
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;

-- ───────────────────────── make yourself admin ─────────────────────────
-- 1) Register on the website first.  2) Put your email below and run just this line.
-- update public.profiles set role = 'admin', approved = true where email = 'YOUR_EMAIL_HERE';
