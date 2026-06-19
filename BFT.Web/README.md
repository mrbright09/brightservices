# BFT.Web

React/Vite SPA for the BFT Services platform. Single app, route-based module switching.

## Local development

```bash
cp .env.example .env.local
# Fill in VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID, VITE_API_BASE_URL
npm install
npm run dev
```

Requires **BFT.Api** running on `http://localhost:5000`.

## Route structure

| Route | Module | Phase |
|---|---|---|
| `/freight` | Freight loads + drivers | 2 |
| `/tow` | Tow dispatch | 4 |
| `/health` | Health triage | 4 |
| `/drivers` | Driver management | 2 |
| `/reports` | Cross-module reporting | 3 |

## Deploy to Azure Static Web Apps

```bash
npm run build
# Deploy dist/ to Azure Static Web Apps (free tier)
```

Set environment variables in Azure Static Web Apps → Configuration:
- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`  
- `VITE_API_BASE_URL` (your Azure Container Apps URL)
