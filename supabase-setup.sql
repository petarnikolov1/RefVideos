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
--   video_comments  comments on the videos, approved members only (the author or an admin deletes; no one edits)
--   video_notes    each member's private notes on the videos: only the writer reads, edits or deletes them
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
-- (no update policy: a comment can't be edited, by its author or by an admin — only deleted)

-- ───────────────────────── private notes on videos ─────────────────────────
-- each member's own notes on a clip: only that member can read, add, edit or delete them — no one else, admins included
create table if not exists public.video_notes (
  id          bigint generated always as identity primary key,
  video_id    bigint not null references public.videos(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists video_notes_user_idx on public.video_notes (user_id, video_id, created_at);
create index if not exists video_notes_video_idx on public.video_notes (video_id);
alter table public.video_notes enable row level security;

-- a note is always its writer's; an edit changes only the text (and when it was edited)
create or replace function public.notes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.created_at := now(); new.updated_at := now();
  else
    new.user_id := old.user_id; new.video_id := old.video_id; new.created_at := old.created_at;
    new.updated_at := case when new.body is distinct from old.body then now() else old.updated_at end;
  end if;
  return new;
end; $$;
drop trigger if exists notes_guard on public.video_notes;
create trigger notes_guard before insert or update on public.video_notes
  for each row execute function public.notes_guard();

drop policy if exists "notes: own read" on public.video_notes;
create policy "notes: own read" on public.video_notes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notes: approved members write own" on public.video_notes;
create policy "notes: approved members write own" on public.video_notes
  for insert to authenticated with check (user_id = (select auth.uid()) and private.is_approved());
drop policy if exists "notes: own edit" on public.video_notes;
create policy "notes: own edit" on public.video_notes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notes: own delete" on public.video_notes;
create policy "notes: own delete" on public.video_notes for delete to authenticated using (user_id = (select auth.uid()));

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

-- ───────────────────────── forum (approved members) ─────────────────────────
-- Material for the referees' preparation, in three sections: documents (the Laws of the Game, regulations), documentaries
-- and films, and training. Approved members read, post and comment; the author edits or deletes a post; an admin pins it,
-- moves it to another section or deletes it, but doesn't change what the author wrote. Comments, as on the videos:
-- no one edits them, the author or an admin deletes them.
create table if not exists public.forum_posts (
  id          bigint generated always as identity primary key,
  category    text not null check (category in ('docs', 'films', 'training')),
  title       text not null check (char_length(btrim(title)) between 2 and 200),
  body        text check (body is null or char_length(body) <= 10000),
  links       text[] not null default '{}' check (cardinality(links) <= 30),
  files       jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 30),
  pinned      boolean not null default false,
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists forum_posts_cat_idx on public.forum_posts (category, pinned desc, created_at desc);
create index if not exists forum_posts_user_idx on public.forum_posts (user_id);
alter table public.forum_posts enable row level security;

-- the author is whoever posts it; an admin who isn't the author can only pin it or move it; links are https; the
-- files are in the author's own folder of the forum bucket ({ path, name, size, type })
create or replace function public.forum_posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare f jsonb;
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.author_name := (select display_name from public.profiles where id = auth.uid());
    new.created_at := now(); new.updated_at := now();
    if not private.is_admin() then new.pinned := false; end if;
  else
    new.user_id := old.user_id; new.author_name := old.author_name; new.created_at := old.created_at;
    if old.user_id is distinct from auth.uid() then
      new.title := old.title; new.body := old.body; new.links := old.links; new.files := old.files;
    end if;
    if not private.is_admin() then new.pinned := old.pinned; end if;
    new.updated_at := case when (new.title, new.body, new.links, new.files) is distinct from (old.title, old.body, old.links, old.files)
      then now() else old.updated_at end;
  end if;
  if exists (select 1 from unnest(new.links) l where l !~ '^https://\S+$' or char_length(l) > 2000) then
    raise exception 'A link must start with https://';
  end if;
  for f in select value from jsonb_array_elements(new.files) loop
    if jsonb_typeof(f) <> 'object' or new.user_id is null or coalesce(f->>'path', '') not like new.user_id::text || '/%'
       or char_length(coalesce(f->>'name', '')) not between 1 and 255 then
      raise exception 'A file must be in the author''s own folder';
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists forum_posts_guard on public.forum_posts;
create trigger forum_posts_guard before insert or update on public.forum_posts
  for each row execute function public.forum_posts_guard();

drop policy if exists "forum posts: approved members read" on public.forum_posts;
create policy "forum posts: approved members read" on public.forum_posts for select to authenticated using (private.is_approved());
drop policy if exists "forum posts: approved members post" on public.forum_posts;
create policy "forum posts: approved members post" on public.forum_posts for insert to authenticated with check (private.is_approved());
drop policy if exists "forum posts: author or admin update" on public.forum_posts;
create policy "forum posts: author or admin update" on public.forum_posts for update to authenticated
  using ((user_id = (select auth.uid()) and private.is_approved()) or private.is_admin())
  with check ((user_id = (select auth.uid()) and private.is_approved()) or private.is_admin());
drop policy if exists "forum posts: author or admin delete" on public.forum_posts;
create policy "forum posts: author or admin delete" on public.forum_posts for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create table if not exists public.forum_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.forum_posts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists forum_comments_post_idx on public.forum_comments (post_id, created_at);
create index if not exists forum_comments_user_idx on public.forum_comments (user_id);
alter table public.forum_comments enable row level security;
drop trigger if exists forum_comments_set_author on public.forum_comments;
create trigger forum_comments_set_author before insert on public.forum_comments
  for each row execute function public.comments_set_author();

drop policy if exists "forum comments: approved members read" on public.forum_comments;
create policy "forum comments: approved members read" on public.forum_comments for select to authenticated using (private.is_approved());
drop policy if exists "forum comments: approved members write" on public.forum_comments;
create policy "forum comments: approved members write" on public.forum_comments for insert to authenticated with check (private.is_approved());
drop policy if exists "forum comments: author or admin delete" on public.forum_comments;
create policy "forum comments: author or admin delete" on public.forum_comments for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
-- (no update policy: a comment can't be edited — only deleted)

-- the forum's files: documents, pictures and short videos, 50 MB each (the free plan's limit); private — approved members
-- open them through short-lived signed links
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum', 'forum', false, 52428800, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'application/rtf',
  'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "forum bucket: approved members read" on storage.objects;
create policy "forum bucket: approved members read" on storage.objects for select to authenticated
  using (bucket_id = 'forum' and private.is_approved());
drop policy if exists "forum bucket: approved upload to own folder" on storage.objects;
create policy "forum bucket: approved upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'forum' and private.is_approved() and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "forum bucket: owner or admin delete" on storage.objects;
create policy "forum bucket: owner or admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'forum' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin()));

-- ───────────────────────── function permissions ─────────────────────────
-- trigger functions are internal; the two checks are only needed by logged-in users
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.videos_set_uploader() from public, anon, authenticated;
revoke execute on function public.comments_set_author() from public, anon, authenticated;
revoke execute on function public.videos_guard() from public, anon, authenticated;
revoke execute on function public.forum_posts_guard() from public, anon, authenticated;
revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.is_approved() from public, anon;
drop function if exists public.is_admin();
drop function if exists public.is_approved();
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;

-- ───────────────────────── Google Drive clips for the video player ─────────────────────────
-- Is this Google Drive file one of the site's videos (or a link in a forum post)? The site's Cloudflare worker
-- (/drive/video) streams Drive files to the page's own player (Google refuses them to other sites' pages) and asks this
-- first, so it serves the site's clips only. Says yes or no and nothing else; the videos themselves stay members-only.
create or replace function public.video_drive_ok(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_id ~ '^[A-Za-z0-9_-]{10,100}$', false)
     and (exists (select 1 from public.videos v where v.video_url is not null and position(p_id in v.video_url) > 0)
       or exists (select 1 from public.forum_posts p where position(p_id in array_to_string(p.links, ' ')) > 0));
$$;
revoke all on function public.video_drive_ok(text) from public;
grant execute on function public.video_drive_ok(text) to anon, authenticated;

-- ───────────────────────── make yourself admin ─────────────────────────
-- 1) Register on the website first.  2) Put your email below and run just this line.
-- update public.profiles set role = 'admin', approved = true where email = 'YOUR_EMAIL_HERE';
