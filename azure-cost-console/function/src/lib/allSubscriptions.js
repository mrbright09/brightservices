const { armGet } = require("./azureAuth");

const EXCLUDED_NAME_PATTERNS = [
  /azure for students/i,
  /visual studio/i,
  /^azure subscription \d+$/i
];
function isExcludedSubscription(name) {
  return EXCLUDED_NAME_PATTERNS.some((re) => re.test(name || ""));
}

async function listAllSubscriptions(context) {
  let url = "https://management.azure.com/subscriptions?api-version=2022-12-01";
  const items = [];
  while (url) {
    const data = await armGet(url, context);
    items.push(...(data.value || []));
    url = data.nextLink || null;
  }
  return items
    .filter((d) => d.state === "Enabled" && !isExcludedSubscription(d.displayName))
    .map((d) => ({ id: d.subscriptionId, name: d.displayName || d.subscriptionId }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { listAllSubscriptions, isExcludedSubscription };
