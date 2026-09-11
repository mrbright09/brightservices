const { app } = require("@azure/functions");
const { armGet } = require("../lib/azureAuth");
const { getCached, setCached, getCachedStale } = require("../lib/cache");
const { listAllSubscriptions } = require("../lib/allSubscriptions");

app.http("subscriptions", {
  methods: ["GET"],
  authLevel: "function",
  route: "subscriptions",
  handler: async (request, context) => {
    const cacheKeySource = request.url;
    const cacheMaxAgeMs = (Number(process.env.AZURE_COST_CACHE_MINUTES) || 30) * 60 * 1000;
    const cached = await getCached(cacheKeySource, cacheMaxAgeMs);
    if (cached) return { status: 200, jsonBody: cached, headers: { "X-Cache": "HIT" } };

    const managementGroupId = process.env.AZURE_MANAGEMENT_GROUP_ID;
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

    if (managementGroupId) {
      let subscriptions;
      try {
        subscriptions = await listAllSubscriptions(context);
      } catch (e) {
        context.error(e);
        const stale = await getCachedStale(cacheKeySource);
        if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
        return { status: 502, jsonBody: { error: "Subscriptions list query failed", details: e.message } };
      }
      const result = { subscriptions };
      await setCached(cacheKeySource, result);
      return { status: 200, jsonBody: result, headers: { "X-Cache": "MISS" } };
    }

    if (subscriptionId) {
      const url = `https://management.azure.com/subscriptions/${subscriptionId}?api-version=2022-12-01`;
      let data;
      try {
        data = await armGet(url, context);
      } catch (e) {
        context.error(e);
        const stale = await getCachedStale(cacheKeySource);
        if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
        return { status: 502, jsonBody: { error: "Subscription lookup failed", details: e.message } };
      }
      const result = { subscriptions: [{ id: subscriptionId, name: data.displayName || subscriptionId }] };
      await setCached(cacheKeySource, result);
      return { status: 200, jsonBody: result, headers: { "X-Cache": "MISS" } };
    }

    return {
      status: 400,
      jsonBody: { error: "AZURE_MANAGEMENT_GROUP_ID or AZURE_SUBSCRIPTION_ID app setting is required." }
    };
  }
});
