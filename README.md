# RefVideos — BG Referee Watch

A news site for refereeing in Bulgarian football — efbet Liga (1st League), 2nd League, 3rd League and the Bulgarian Cup — with match videos.

## Features

- **Stories, not duplicates.** Articles about the same incident (for example a red card in Левски – Дунав) are grouped into one story. Expand it to see every article and source; exact re-posts are marked **Duplicate**.
- **Bulgaria / World split.** Foreign football never appears in the Bulgaria feed. The **World** tab shows only the biggest refereeing stories from the Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and the Champions League (covered by at least two outlets or rated major). Other foreign leagues, the Europa/Conference League and national teams are left out.
- **Videos from articles.** When a story is opened, the site reads its articles and embeds the videos it finds (YouTube, Facebook, Vimeo, Dailymotion, Vbox7, Streamable; links for X posts and video files). It also lists the match minutes the articles mention, tagged (penalty, red card, offside, VAR, goal…). With minutes but no video, it points to ebfu.net for the match video. Automatic ebfu.net search will be added next.
- **Read marks.** Stories you've opened show **✓ READ**, and you can hide them. They're stored in the browser and, when logged in, saved to your account.
- **Accounts (optional).** Anyone can read everything. Registered members approved by the admin can upload match clips (file up to 50 MB or a video link) on the **Videos** page or straight from a story. Clips show on the Videos page and inside their story. The admin approves members on the **Admin** page.
- **Searching.** About 50 Bulgarian-language searches on Google News and Bing News for every 2-week window of the season. The site updates itself when opened (if older than 24 h) and every 24 h while open; **Refresh** searches since the last update.

## Files

| File | What it does |
|---|---|
| `public/index.html` | The whole site: page, styles and logic. |
| `public/_worker.js` | Runs on Cloudflare: feed relay (`/feed`), article video/minute finder (`/extract`), Supabase settings (`/config.json`). |
| `supabase-setup.sql` | Creates the database tables, security rules and the video storage bucket in Supabase. |

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

Open `public/index.html` in a browser. News works through public CORS proxies. Video finding needs the Cloudflare worker, and accounts need Supabase.
