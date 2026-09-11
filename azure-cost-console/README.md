# Azure Cost Console -- live backend

Backend + hosting for the Azure Cost Console dashboard. This turns the
static preview into something fed by real Cost Management data, using a
Managed Identity -- no App Registration, no client secret, no Key Vault
required. It reports spend across a whole Azure subscription -- it isn't
scoped to any one workload -- and can break it down by resource group,
Azure service, individual resource, or a cost-allocation tag.

## Why a backend at all

The dashboard is a static HTML/JS page. Browsers can't call Azure Resource
Manager or Cost Management APIs directly from a page like that -- there's no
CORS allowance on those APIs for arbitrary origins, and there's nowhere
secret-free to hold credentials client-side anyway. Something has to sit in
between. This uses the smallest thing that can: one Azure Function.

## Architecture

```
 Storage static website  ---(fetch, CORS-allowed)-->  Azure Function App
 (index.html = dashboard)                              (system-assigned
                                                          managed identity)
                                                              |
                                                              v
                                                  Cost Management API
```

- **Function App** -- one HTTP endpoint, `/api/costSummary`. Authenticates
  outbound to Azure using `DefaultAzureCredential`, which picks up the
  Function App's **system-assigned managed identity** automatically.
  Nothing is stored, nothing to rotate.
- **Storage static website** -- hosts `index.html` (the dashboard). Cheap,
  simple, no server to patch.
- **RBAC role** granted to the identity, read-only: `Cost Management
  Reader` on the whole subscription.

## Deploy

1. Edit the variables at the top of [`infra/deploy.sh`](infra/deploy.sh):
   `SUBSCRIPTION_ID`, `LOCATION`.
2. Run it from a bash shell logged into Azure CLI (`az login`) as a user with
   Contributor + User Access Administrator (or Owner) on the subscription:
   ```bash
   cd infra
   ./deploy.sh
   ```
   It creates the resource group, Function App, storage static website,
   role assignment, uploads `frontend/avd_cost_console.html` as
   `index.html`, and prints the Function URL, key, and static site URL.
3. Deploy the function code:
   ```bash
   cd ../function
   npm install
   func azure functionapp publish <function-app-name-from-step-2>
   ```
   (Needs [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) -- `npm i -g azure-functions-core-tools@4`.)

## Wiring the dashboard to live data

`frontend/avd_cost_console.html` ships with illustrative sample numbers as
its zero-backend fallback, but the "Connect to Azure" panel's **Load live
data** button is wired up: enter the deployed Function App URL and key and
it calls `/api/costSummary` with whichever **Group by** dimension is
selected on the dashboard (resource group / service / resource / tag) and
replaces the sample breakdown with the real response. Switching the
group-by dimension while connected triggers a fresh fetch for that
dimension; each (year, dimension) combination is cached client-side so
flipping back doesn't re-fetch. The connection is remembered in
`localStorage` so it reconnects on reload. This only works when the page is
served from its own hosted static site -- the claude.ai artifact preview
sandbox blocks outbound network calls entirely, so open the deployed static
site URL directly to use live data.

## API contract

**`GET /api/costSummary?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=<dimension>&tagKey=<key>`**

`groupBy` is one of `resourceGroup` (default), `service`, `resource`, or
`tag`. `tagKey` is required when `groupBy=tag` -- Cost Management groups by
one specific tag key at a time (e.g. `tagKey=Environment`), it can't return
a breakdown across all tags in one call.

```json
{
  "subscriptionId": "00000000-0000-0000-0000-000000000000",
  "groupBy": "resourceGroup",
  "months": [
    {
      "month": "2026-01",
      "total": 41200.00,
      "breakdown": [
        { "name": "rg-prod-app", "cost": 19000.00 },
        { "name": "rg-data-platform", "cost": 11000.00 }
      ]
    }
  ]
}
```
Always reports the whole subscription -- there's no resource-group filter to
configure independent of `groupBy`. `breakdown` entries within a month are
sorted by cost, descending. For `groupBy=resource`, `breakdown[].name` is a
best-effort human-readable label derived from the ARM resource ID (see
`friendlyResourceName` in `costSummary.js`), not the raw ID.

## Known limitations, read before trusting the numbers

- **Response shapes are written to match the documented Cost Management
  API schema** but weren't validated against a live tenant here -- check the
  actual JSON your subscription returns (column names/order can shift
  slightly across api-versions) before relying on it. The `groupBy=tag`
  path is the least certain: which column holds the grouped tag value
  differs across api-versions/docs, and the code defensively checks two
  possible shapes -- verify against your tenant before trusting tag totals.
- **Resources/services/resources outside the grouped dimension** (e.g. no
  resource group, or untagged for `groupBy=tag`) are labeled `"(none)"` /
  `"(untagged)"` rather than dropped.
- **The function key is visible in the page source** once the dashboard
  calls it client-side. Acceptable for a single-operator internal tool;
  if others will use this, put the static site behind Azure AD auth
  (e.g. Azure Static Web Apps with built-in auth) instead.
