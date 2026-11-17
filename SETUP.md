# brightservices: Secrets and Setup

No keys, passwords, or tokens live in this repo. Everything below is set **outside** git.
If you're rebuilding from scratch, work top to bottom.

## Secrets inventory

| Secret | Used by | Where it goes | How to get it |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | `assets/web/assets/bft-voice-agent.html` (map panel) | GitHub repo secret (Settings > Secrets and variables > Actions) | Google Cloud Console > APIs & Services > Credentials |
| `ANTHROPIC_API_KEY` | `onyx-proxy` Cloudflare Worker | Cloudflare Worker secret | console.anthropic.com > API Keys |
| Function App settings (`AVD_SUBSCRIPTION_ID`, `AVD_RESOURCE_GROUP`) | `azure-cost-console/function` | Azure Function App > Configuration (prod) / `local.settings.json` (dev, gitignored) | Your Azure subscription |
| Function key | Azure cost console dashboard | Entered in the dashboard UI at runtime (browser localStorage). Never commit. | Function App > App keys |

## 1. Website (GitHub Pages + Google Maps)

The site is deployed by `.github/workflows/pages.yml`, which writes `site-config.js` from the repo secret at deploy time.

1. **Create the Maps key** in Google Cloud Console and lock it down:
   - Application restrictions: **Websites** > `https://brightfuturetechllc.com/*`, `https://www.brightfuturetechllc.com/*`
   - API restrictions: **Maps JavaScript API** only
   - Set a billing budget alert on the project
2. **Add repo secret** `GOOGLE_MAPS_API_KEY` (Settings > Secrets and variables > Actions > New repository secret).
3. **Switch Pages to Actions**: Settings > Pages > Build and deployment > Source = **GitHub Actions**. Custom domain stays `brightfuturetechllc.com` (CNAME file is still in the repo).
4. Push to `master` or run the workflow manually (Actions > Deploy site to GitHub Pages > Run workflow).

**Local testing:** `cp site-config.example.js site-config.js`, paste a key (add `http://localhost:*` to the key's allowed referrers), then serve the folder.

> A browser Maps key is always visible to visitors in network traffic. That's normal for Google Maps. The protection is the **referrer + API restriction and the budget cap**, not hiding it.

## 2. Onyx proxy (Cloudflare Worker)

```bash
cd onyx-proxy
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY      # paste key when prompted
npx wrangler deploy
```

- KV namespace `BFT_RATE_LIMIT` is bound in `wrangler.jsonc` (namespace IDs are not secrets).
- Local dev: put `ANTHROPIC_API_KEY=...` in `onyx-proxy/.dev.vars` (gitignored), then `npx wrangler dev`.
- **Set a monthly spend limit** in the Anthropic Console for the key used here.
- Hardening still open: CORS alone does not block non-browser callers. Add Cloudflare Turnstile or a signed token before the Worker forwards to Anthropic.

## 3. Azure cost console (Function App)

See `azure-cost-console/README.md` for the full deploy.

- Dev: `cp azure-cost-console/function/local.settings.json.example azure-cost-console/function/local.settings.json` and fill in values. That file is gitignored.
- Prod: Function App uses Managed Identity (`Cost Management Reader`), so no client secret exists. App settings go in the Function App's Configuration blade.

## Key rotation log

Keys that were previously committed to this repo's history are considered **burned**. Delete them in their consoles; removing them from the code does not remove them from git history.

| Date | Secret | Action |
|---|---|---|
| 2026-11-16 | Google Maps key (`AIza...9QfI`) | Removed from code. **Delete in Google Cloud Console and issue a new restricted key.** |
| 2026-11-16 | Legacy Instagram token (in history) | Instagram legacy API is retired; token is dead. No action. |
