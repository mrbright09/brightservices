const { app } = require("@azure/functions");
const { armGet } = require("../lib/azureAuth");
const { getCached, setCached, getCachedStale } = require("../lib/cache");

app.http("tagKeys", {
  methods: ["GET"],
  authLevel: "function",
  route: "tagKeys",
  handler: async (request, context) => {
    const managementGroupId = process.env.AZURE_MANAGEMENT_GROUP_ID;
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const urlPrefix = managementGroupId
      ? `https://management.azure.com/providers/Microsoft.Management/managementGroups/${managementGroupId}`
      : subscriptionId
        ? `https://management.azure.com/subscriptions/${subscriptionId}`
        : null;

    if (!urlPrefix) {
      return {
        status: 400,
        jsonBody: { error: "AZURE_MANAGEMENT_GROUP_ID or AZURE_SUBSCRIPTION_ID app setting is required." }
      };
    }

    const cacheKeySource = request.url;
    const cacheMaxAgeMs = (Number(process.env.AZURE_COST_CACHE_MINUTES) || 30) * 60 * 1000;
    const cached = await getCached(cacheKeySource, cacheMaxAgeMs);
    if (cached) {
      return { status: 200, jsonBody: cached, headers: { "X-Cache": "HIT" } };
    }

    const url = `${urlPrefix}/providers/Microsoft.Consumption/tags?api-version=2021-10-01`;
    let data;
    try {
      data = await armGet(url, context);
    } catch (e) {
      context.error(e);
      const stale = await getCachedStale(cacheKeySource);
      if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
      return { status: 502, jsonBody: { error: "Cost Management tags query failed", details: e.message } };
    }

    const rawTags = (data.properties && data.properties.tags) || data.tags || data.value || [];
    const tagKeys = rawTags
      .map((t) => {
        if (typeof t === "string") return t;
        if (t && typeof t === "object") return t.key || t.name || t.tagKey || t.id;
        return null;
      })
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b));

    if (!tagKeys.length) {
      context.warn(`tagKeys: parsed 0 tag keys from response shape ${JSON.stringify(Object.keys(data))} - inspect the raw response if this looks wrong.`);
    }

    const result = { tagKeys };
    await setCached(cacheKeySource, result);
    return { status: 200, jsonBody: result, headers: { "X-Cache": "MISS" } };
  }
});
