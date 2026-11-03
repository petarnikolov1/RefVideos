# RefVideos — BG Referee Watch

A simple news feed of refereeing stories from Bulgarian football: efbet Liga (1st League), 2nd League, 3rd League and the Bulgarian Cup. It covers referee decisions, red cards, penalties, offsides, VAR, Referee and Disciplinary Committee news, fights and other disputes, for the current season.

## What's in the repo

| File | What it does |
|---|---|
| `public/index.html` | The whole site: page, styles and search logic in one file. |
| `public/_worker.js` | Runs on Cloudflare. Serves the page and fetches Google News / Bing News feeds for it at `/feed` (only those two sites are allowed). |

## How it searches

- About 40 Bulgarian-language searches on Google News and 12 on Bing News, run for every 2-week window of the season, so older stories are not pushed out.
- **Refresh** searches only since the last update. The page also searches by itself when opened if the last update is older than 24 hours, and every 24 hours while it stays open.
- Results are saved in the visitor's browser, tagged by division and topic, and merged when several outlets report the same story.
- On Cloudflare, feeds go through the site's own `/feed` relay. If that fails, the page falls back to public CORS proxies automatically. The Diagnostics log at the bottom of the page shows which one is used.

## Deploying on Cloudflare Pages (one-time setup)

1. In the Cloudflare dashboard, open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Choose **GitHub**, authorise Cloudflare, and pick the **RefVideos** repository.
3. Build settings:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `public`
4. Select **Save and Deploy**. The site is live at `https://<project-name>.pages.dev`.

After that, every push to `main` redeploys the site automatically.

## Running it locally

Open `public/index.html` directly in a browser. Without Cloudflare it uses the public CORS proxies, which can be slower or occasionally down.
