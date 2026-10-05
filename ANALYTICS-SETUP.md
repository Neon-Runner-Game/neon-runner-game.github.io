# Neon Runner analytics setup (Cloudflare Workers + D1)

GitHub Pages serves static files and does not provide persistent server-side storage. This project uses a Cloudflare Worker API and a D1 SQLite database. The API and database are separate from the GitHub Pages host.

## What is stored

After a player opts in, the game sends only a random UUID visitor ID, a random per-run ID, event type (`game_started` / `game_over`), server timestamp, run duration in whole seconds and score. The database schema has no columns for IP address, name, email, user agent, browser/device model, referrer or page history. The Worker does not read request IP headers or log request bodies. A browser ID is a persistent online identifier, so it is pseudonymous rather than guaranteed legally anonymous; use the opt-in controls and publish an appropriate privacy notice. Cloudflare still handles network metadata to deliver requests.

Statistics are aggregated behind an admin-token gate at `stats.html`. The admin token is a Worker secret and is entered only in memory on the stats page; never put it in `analytics-config.js` or the game HTML.

## One-time setup

You need a free Cloudflare account and Node.js/npm on a computer. Cloudflare's current Free limits are 100,000 Worker requests/day and D1 includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage; limits are shared with other use on the account and can change.

1. Download/clone this repository, open a terminal in the folder containing `wrangler.toml`, then run `npx wrangler login`. Approve the Cloudflare login in your browser.
2. Create the database: `npx wrangler d1 create neon-runner-analytics`. Copy the returned database ID into `wrangler.toml`, replacing `REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE`.
3. Create the schema: `npx wrangler d1 execute neon-runner-analytics --remote --file=schema.sql`.
4. Set a long, random admin token (at least 32 random bytes). Run `npx wrangler secret put ADMIN_TOKEN` and paste the generated value into the terminal prompt. Do not commit or send this token.
5. Deploy the Worker: `npx wrangler deploy`. Copy the resulting `https://…workers.dev` URL.
6. In `analytics-config.js`, set `window.NEON_RUNNER_ANALYTICS_ENDPOINT` to that Worker URL (without a trailing slash). Commit/push the changed `analytics-config.js` and `index.html` to the `Neon-Runner-Game/neon-runner-game.github.io` repository. GitHub Pages will publish them.
7. Open `https://neon-runner-game.github.io/stats.html`, enter the admin token and click **Statistiken laden**.

The HTML frontend is deliberately ready while the endpoint is blank. Until the Worker is deployed and the endpoint is entered, no analytics requests are sent and the game works normally.

## Local Worker check

After D1 setup and binding configuration, run `npx wrangler dev`. The Worker permits local test origins on port 8787. Do not put production admin tokens in source files.

## Publish subsequent changes

Push updated static files to the `main` branch of `Neon-Runner-Game/neon-runner-game.github.io`; GitHub Pages deploys from the repository root. Deploy backend changes from this folder with `npx wrangler deploy`.
