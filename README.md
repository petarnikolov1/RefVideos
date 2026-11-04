# RefVideos — BG Referee Watch

A news site for refereeing in Bulgarian football — efbet Liga (1st League), 2nd League, 3rd League and the Bulgarian Cup — with match videos.

## Features

- **Stories, not duplicates.** Articles about the same incident (for example a red card in Левски – Дунав) are grouped into one story. Expand it to see every article and source; exact re-posts are marked **Duplicate**.
- **Bulgaria / World split.** Foreign football never appears in the Bulgaria feed. The **World** tab shows only the biggest refereeing stories from the Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and the Champions League (covered by at least two outlets or rated major). Other foreign leagues, the Europa/Conference League and national teams are left out.
- **Videos from articles.** The site reads each story's articles and embeds the videos it finds: YouTube (including lazy players), Facebook, Instagram, TikTok, Vimeo, Dailymotion, Vbox7, Streamable, a news site's own player, and plain video files. It also lists the match minutes the articles mention, tagged (penalty, red card, offside, VAR, goal…), on the card and in the story.
  - Google News links are resolved to the original article. If Google refuses, the same headline is found through Bing. Sites that block servers are read through public relays.
  - When an article can't be opened, the story says why, and **↻ Look for videos again** retries.
- **ebfu.net.** Every Bulgarian story shows the match, date, division and the situations (minutes, or the type of incident) with a button to the ebfu.net video archive. Each member uses their own ebfu.net login. Jumping straight to the match and minute will be added once the archive's links are known.
- **Read marks.** Stories you've opened show **✓ READ**, and you can hide them. They're stored in the browser and, when logged in, saved to your account.
- **Accounts (optional).** Anyone can read everything. Registered members approved by the admin can upload match clips (file up to 50 MB or a video link) on the **Videos** page or straight from a story. Clips show on the Videos page and inside their story. The admin approves members on the **Admin** page.
- **Comments.** Approved members can comment on uploaded videos. Everyone can read the comments. The author or the admin can delete a comment.
- **Results and table.** Every round of the 2026/27 season of efbet Лига and Mr Bit Втора лига: both team logos, the score and half-time, and for each played match Gong.bg's short report (**▶ Репортаж**) and extended report (**▶ Разширен**), played right in the match card, plus reports from other channels under **▶ Други**. Many 2nd-league matches have no Gong report, only a club's clip or nothing at all. The page opens on the latest round; ‹ › and the round picker move between rounds.
  - **Обзор на кръга.** At the top of every played round: the round's review show (Diema's "Обзор на кръга", uploaded by Gong.bg to YouTube), for both leagues. It plays on the page, or opens on YouTube when the owner allows only that.
  - **Table.** Under the round's matches, the current table of the same league: games, wins, draws, losses, goals, goal difference, points and the last five results.
- **Searching (on the server, kept).** The news is searched on Supabase, not in your browser, and every story found is saved. Every 30 minutes the last few days are searched again (about 50 Google News and Bing News searches). In the background the whole season is gone through once a day, 2 weeks at a time, so stories published or indexed late are added too. Nothing found is searched again from scratch. The page opens instantly from the saved stories; **Refresh** reloads them.
- **NEW.** Stories found since your last visit are marked **NEW**, including older-dated stories that were only found now. Stories are sorted by date, newest first (or by importance).
- **Refereeing only.** A story is kept only when its headline is about refereeing: referees and their appointments, decisions (penalties, red and yellow cards, offsides, disallowed goals, VAR, fouls and handballs), the Referee Committee, disciplinary sanctions and fines, attacks on referees, fights and incidents, match fixing, and complaints about refereeing. Transfers, contracts, injuries, coaching changes, interviews, live match blogs and penalties that were only taken or saved are left out unless the headline itself is about a refereeing decision.

## Files

| File | What it does |
|---|---|
| `public/index.html` | The whole site: page, styles and logic. |
| `public/_worker.js` | Runs on Cloudflare: article video/minute finder (`/extract`), feed relay (`/feed`, a fallback for the news search), Supabase settings (`/config.json`). |
| `supabase-setup.sql` | Creates the database tables (members, videos, comments, read marks), security rules and the video storage bucket in Supabase. |
| `supabase/football-setup.sql` | Results and tables: the match, table and round-review tables, helper functions and the two scheduled sync jobs. |
| `supabase/news-setup.sql` | Saved news: the news table, merge function and the two scheduled search jobs. |
| `supabase/functions/news-sync/` | Supabase Edge Function that searches Google News and Bing News and saves the refereeing stories (the filter is in `news.js`). |
| `supabase/functions/football-sync/` | Supabase Edge Function that reads results, fixtures, logos and tables from efbetleague.com and mr-bit.bg, and finds each match's reports and each round's review on YouTube. |

## Results and Table — how they stay current

The Edge Function **football-sync** runs on Supabase on a schedule. The site only reads the saved data, so the pages open instantly.

- **Results, fixtures, tables:** at :02 and :32 every hour, from efbetleague.com (1st league) and mr-bit.bg (2nd league).
- **Videos:** every 5 minutes, up to 10 played matches are searched on YouTube. A match still missing a Gong report is retried after 3 hours, 12 hours, a day, then every 3 days for its first 10 days; an older match is searched once. Searches use the short club names Gong uses in its titles (Левски, Славия, Локомотив София…), and a Gong title with a mistyped score is still accepted when its round is right. A video is only accepted when its title names both teams with the home team first, any score, round or season in it agrees with the match, and it isn't older than the match. Analysis shows and interviews are skipped.
- **Обзор на кръга:** with the results job (every 30 minutes) up to 3 YouTube searches look for the review of rounds that have been mostly played and don't have one yet: right away, then after 3, 6, 12 and 24 hours, then daily, up to 12 searches; a round more than two weeks old is searched twice (Gong posts the show a day or two after the round, later around international breaks). Titles like "Обзор на кръга в efbet Лига (14 кръг, 3.11.2026)" or "Обзор на кръга в Mr Bit Втора лига (14 кръг, 04.11.2026)" are matched by league and round; a title with only a date is matched to the round that ended just before it. One search usually finds several rounds at once. "Героите на кръга", "Преди кръга" and last season's shows are skipped.
- **Gong first, others separately.** **▶ Репортаж** and **▶ Разширен** are always Gong.bg's reports, in both leagues, whenever Gong has them. Every other video of the match (the league's channel, clubs, media and other uploads whose title names both teams with the right score or round) is listed under a third button, **▶ Други**.
- **Playable here or only on YouTube.** Some owners (Gong.bg among them) block their videos from playing on other sites. Every video is checked with YouTube, and a blocked one opens on YouTube when its button is clicked. Under every video that plays on the page there is a **Гледай в YouTube** button.
- If a result is corrected, its videos are cleared and found again.

To redeploy the function: `supabase functions deploy football-sync --no-verify-jwt`.

## Cloudflare Pages

1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git** → GitHub → **RefVideos**.
2. Production branch `main`, Framework preset **None**, Build command empty, Build output directory **`public`**.
3. **Save and Deploy**. Every push to `main` redeploys automatically.

## Supabase (accounts and video uploads)

The site uses the **RefVideos** Supabase project (Frankfurt). The database, security rules and the `videos` storage bucket are already set up from `supabase-setup.sql`. The project URL and publishable key are at the top of the script in `public/index.html`; the key is meant to be public, and the data is protected by the security rules.

Still to do in the Supabase dashboard:

1. **Authentication → URL Configuration:** set **Site URL** to the site's address (for example `https://refvideos.pages.dev`) and add the same address under **Redirect URLs**, so confirmation and password-reset emails link back to the site.
2. Register on the site, then make that account the admin. Run `update public.profiles set role = 'admin', approved = true where email = '…';` in the SQL Editor.

New members start as **waiting for approval**. Approve them on the site's **Admin** page.

To use a different Supabase project, run `supabase-setup.sql` there and change the two values in `index.html`. Alternatively, clear them and set `SUPABASE_URL` / `SUPABASE_ANON_KEY` as Cloudflare Pages variables.

## Running it locally

Open `public/index.html` in a browser. News, results and accounts come from Supabase; video finding needs the Cloudflare worker.
