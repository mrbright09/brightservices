#!/usr/bin/env bash
# Provisions the backend environment for the Azure Cost Console:
#   - a Function App (system-assigned managed identity, no secrets)
#   - an RBAC role granting that identity read-only access to Cost
#     Management for the whole subscription
#   - a Storage Account static website to host the dashboard HTML
#
# Run this yourself after reviewing it - it creates real billable resources
# and role assignments in your subscription. Requires:
#   - Azure CLI logged in (`az login`) as a user with Contributor on the
#     target subscription (to create resources) AND User Access
#     Administrator or Owner (to create role assignments)
#   - bash (Cloud Shell, WSL, Git Bash, or macOS/Linux terminal)
set -euo pipefail

# ============== EDIT THESE ==============
SUBSCRIPTION_ID="YOUR_SUBSCRIPTION_ID_HERE"     # subscription to report cost for
LOCATION="eastus"
BACKEND_RG="rg-azurecost-console"            # new resource group this script creates
NAME_SUFFIX="${NAME_SUFFIX:-$RANDOM}"        # override with: NAME_SUFFIX=myorg ./deploy.sh
# =========================================

FUNC_STORAGE="azcostfnst${NAME_SUFFIX}"
FUNC_APP="azure-cost-api-${NAME_SUFFIX}"
WEB_STORAGE="azcostweb${NAME_SUFFIX}"


echo "== Target subscription =="
az account show --subscription "$SUBSCRIPTION_ID" --query "{name:name, id:id}" -o table
az account set --subscription "$SUBSCRIPTION_ID"

echo "== Registering resource providers (no-op if already registered) =="
az provider register --namespace Microsoft.CostManagement
az provider register --namespace Microsoft.Web

echo "== Creating backend resource group: $BACKEND_RG =="
az group create --name "$BACKEND_RG" --location "$LOCATION" -o table

echo "== Creating Function runtime storage: $FUNC_STORAGE =="
az storage account create \
  --name "$FUNC_STORAGE" \
  --resource-group "$BACKEND_RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  -o table

echo "== Creating Function App: $FUNC_APP =="
az functionapp create \
  --name "$FUNC_APP" \
  --resource-group "$BACKEND_RG" \
  --storage-account "$FUNC_STORAGE" \
  --consumption-plan-location "$LOCATION" \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4 \
  --os-type Linux \
  -o table

echo "== Enabling system-assigned managed identity (no app registration, no secret) =="
PRINCIPAL_ID=$(az functionapp identity assign \
  --name "$FUNC_APP" \
  --resource-group "$BACKEND_RG" \
  --query principalId -o tsv)
echo "Managed identity principalId: $PRINCIPAL_ID"

echo "Waiting ~20s for the identity to propagate in Entra ID before assigning roles..."
sleep 20

echo "== Granting Cost Management Reader on the subscription =="
COST_MGMT_ROLE_ID=$(az role definition list --name "Cost Management Reader" --query "[0].name" -o tsv)
if [ -z "$COST_MGMT_ROLE_ID" ]; then
  echo "Could not resolve the 'Cost Management Reader' role definition ID - check the role name and your permissions." >&2
  exit 1
fi
az role assignment create \
  --subscription "$SUBSCRIPTION_ID" \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "$COST_MGMT_ROLE_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"

echo "== Configuring Function App settings =="
az functionapp config appsettings set \
  --name "$FUNC_APP" \
  --resource-group "$BACKEND_RG" \
  --settings \
    "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID" \
  -o table

echo "== Creating static website storage: $WEB_STORAGE =="
az storage account create \
  --name "$WEB_STORAGE" \
  --resource-group "$BACKEND_RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  -o table

echo "== Enabling static website hosting =="
az storage blob service-properties update \
  --account-name "$WEB_STORAGE" \
  --static-website \
  --index-document index.html \
  --404-document index.html

WEB_ENDPOINT=$(az storage account show \
  --name "$WEB_STORAGE" \
  --resource-group "$BACKEND_RG" \
  --query "primaryEndpoints.web" -o tsv)
echo "Static site endpoint: $WEB_ENDPOINT"

DASHBOARD_HTML="../frontend/avd_cost_console.html"
if [ -f "$DASHBOARD_HTML" ]; then
  echo "== Uploading dashboard as index.html =="
  az storage blob upload \
    --account-name "$WEB_STORAGE" \
    --container-name '$web' \
    --name index.html \
    --file "$DASHBOARD_HTML" \
    --auth-mode login \
    --overwrite
else
  echo "NOTE: $DASHBOARD_HTML not found - upload your dashboard HTML to the '\$web' container as index.html manually."
fi

echo "== Allowing the static site to call the Function App (CORS) =="
az functionapp cors add \
  --name "$FUNC_APP" \
  --resource-group "$BACKEND_RG" \
  --allowed-origins "$WEB_ENDPOINT"

echo "== Fetching the Function host key =="
FUNC_KEY=$(az functionapp keys list \
  --name "$FUNC_APP" \
  --resource-group "$BACKEND_RG" \
  --query "functionKeys.default" -o tsv 2>/dev/null || echo "")

if [ -z "$FUNC_KEY" ]; then
  echo "  (functionapp keys list unsupported on this CLI version - fetching via az rest instead)"
  FUNC_KEY=$(az rest --method post \
    --uri "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$BACKEND_RG/providers/Microsoft.Web/sites/$FUNC_APP/host/default/listKeys?api-version=2022-03-01" \
    --query "functionKeys.default" -o tsv)
fi

cat <<SUMMARY

================= DONE =================
Function App URL:   https://${FUNC_APP}.azurewebsites.net
Function key:        ${FUNC_KEY}

Static dashboard:     ${WEB_ENDPOINT}
Managed identity:     ${PRINCIPAL_ID}
  role: Cost Management Reader (subscription)

Next steps:
  1. Deploy the function code:
       cd ../function && npm install && func azure functionapp publish ${FUNC_APP}
  2. In the dashboard's "Connect to Azure" panel, enter:
       Function App URL: https://${FUNC_APP}.azurewebsites.net
       Function key:     ${FUNC_KEY}
  3. Re-upload index.html to \$web after any dashboard edit:
       az storage blob upload --account-name ${WEB_STORAGE} --container-name '\$web' \\
         --name index.html --file ../frontend/avd_cost_console.html --auth-mode login --overwrite

Security note: the function key above is visible to anyone who views the
static page's source, since it's a client-side fetch call. That's an
acceptable trade-off for a single-operator internal tool behind a private
storage endpoint, but if more people will use this, put the static site
behind Azure AD (e.g. Azure Static Web Apps auth, or Application Gateway +
Entra) instead of relying on the function key alone.
==========================================
SUMMARY
