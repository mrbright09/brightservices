const { app } = require("@azure/functions");
const { armPostAllPages, friendlyResourceName, extractMonth, extractDay, addToByMonth, subIdFromResourceId, monthsFromRows, queryMonthlyBreakdown } = require("../lib/costQuery");
const { getCached, setCached, getCachedStale } = require("../lib/cache");
const { listAllSubscriptions } = require("../lib/allSubscriptions");
const { subCacheKey } = require("../lib/subCacheKey");

function resolveCostScope() {
  const managementGroupId = process.env.AZURE_MANAGEMENT_GROUP_ID;
  if (managementGroupId) {
    return {
      type: "ManagementGroup",
      id: managementGroupId,
      urlPrefix: `https://management.azure.com/providers/Microsoft.Management/managementGroups/${managementGroupId}`
    };
  }
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (subscriptionId) {
    return {
      type: "Subscription",
      id: subscriptionId,
      urlPrefix: `https://management.azure.com/subscriptions/${subscriptionId}`
    };
  }
  return null;
}

async function getAllSubscriptionsCached(context) {
  const key = "internal:all-subscriptions";
  const cached = await getCached(key, 60 * 60 * 1000);
  if (cached) return cached.subscriptions;
  try {
    const subscriptions = await listAllSubscriptions(context);
    await setCached(key, { subscriptions });
    return subscriptions;
  } catch (e) {
    context.warn("getAllSubscriptionsCached: live lookup failed, falling back to stale - " + e.message);
    const stale = await getCachedStale(key);
    return stale ? stale.subscriptions : [];
  }
}

async function mergeTenantWideExtras(months, groupBy, tagKey, fromYear, requestedSubscriptionIds, context) {
  if (groupBy === "tag") return months;
  const primaryCovered = new Set();
  months.forEach((m) => (m.breakdown || []).forEach((b) => (b.subIds || []).forEach((id) => primaryCovered.add(id))));

  const allSubs = await getAllSubscriptionsCached(context);
  const requested = requestedSubscriptionIds.length ? new Set(requestedSubscriptionIds) : null;
  const extraSubs = allSubs.filter((s) => !primaryCovered.has(s.id) && (!requested || requested.has(s.id)));

  for (const sub of extraSubs) {
    const cached = await getCachedStale(subCacheKey(sub.id, fromYear, groupBy, tagKey));
    if (!cached || !cached.months) continue;
    for (let i = 0; i < 12; i++) {
      const extra = cached.months[i];
      if (!extra) continue;
      months[i].total += extra.total || 0;
      months[i].breakdown = (months[i].breakdown || []).concat(extra.breakdown || []);
    }
  }
  return months;
}

app.http("costSummary", {
  methods: ["GET"],
  authLevel: "function",
  route: "costSummary",
  handler: async (request, context) => {
    const cacheKeySource = request.url;
    const cacheMaxAgeMs = (Number(process.env.AZURE_COST_CACHE_MINUTES) || 30) * 60 * 1000;
    const cached = await getCached(cacheKeySource, cacheMaxAgeMs);
    if (cached) {
      return { status: 200, jsonBody: cached, headers: { "X-Cache": "HIT" } };
    }

    const costScope = resolveCostScope();
    const from = request.query.get("from");
    const to = request.query.get("to");
    const groupBy = request.query.get("groupBy") || "resourceGroup";
    const tagKey = request.query.get("tagKey");
    const granularity = request.query.get("granularity") || "Monthly";
    const tenantWide = process.env.AZURE_TENANT_WIDE === "true";

    if (!costScope || !from || !to) {
      return {
        status: 400,
        jsonBody: { error: "AZURE_MANAGEMENT_GROUP_ID or AZURE_SUBSCRIPTION_ID app setting, and ?from=YYYY-MM-DD&to=YYYY-MM-DD are required." }
      };
    }
    const subscriptionId = costScope.type === "Subscription" ? costScope.id : undefined;

    const subscriptionIdsRaw = request.query.get("subscriptionIds");
    const subscriptionIds = subscriptionIdsRaw
      ? subscriptionIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const subscriptionIdsFilter = subscriptionIds.length
      ? { dimensions: { name: "SubscriptionId", operator: "In", values: subscriptionIds } }
      : null;
    function withSubscriptionFilter(existingFilter) {
      if (!subscriptionIdsFilter) return existingFilter;
      if (!existingFilter) return subscriptionIdsFilter;
      return { and: [existingFilter, subscriptionIdsFilter] };
    }

    if (granularity === "Daily") {
      const dailyUrl = `${costScope.urlPrefix}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;
      const dailyBody = {
        type: "ActualCost",
        timeframe: "Custom",
        timePeriod: { from, to },
        dataset: {
          granularity: "Daily",
          aggregation: {
            totalCost: { name: "Cost", function: "Sum" },
            totalQuantity: { name: "UsageQuantity", function: "Sum" }
          },
          grouping: []
        }
      };
      if (subscriptionIdsFilter) dailyBody.dataset.filter = withSubscriptionFilter(null);

      let dailyData;
      try {
        dailyData = await armPostAllPages(dailyUrl, dailyBody, context);
      } catch (e) {
        context.error(e);
        const stale = await getCachedStale(cacheKeySource);
        if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
        return { status: 502, jsonBody: { error: "Cost Management daily query failed", details: e.message } };
      }

      const cols = dailyData.properties.columns.map((c) => c.name);
      const idxCost = cols.indexOf("Cost");
      const idxQuantity = cols.indexOf("UsageQuantity");
      const idxUsageDate = cols.indexOf("UsageDate");
      const idxBillingMonth = cols.indexOf("BillingMonth");
      const idxDate = idxUsageDate >= 0 ? idxUsageDate : idxBillingMonth;

      const byDay = {};
      for (const row of dailyData.properties.rows || []) {
        const date = idxDate >= 0 ? extractDay(row[idxDate]) : "(unknown)";
        const cost = Number(row[idxCost]) || 0;
        const quantity = idxQuantity >= 0 ? Number(row[idxQuantity]) || 0 : 0;
        if (!byDay[date]) byDay[date] = { date, cost: 0, quantity: 0 };
        byDay[date].cost += cost;
        byDay[date].quantity += quantity;
      }
      const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

      const dailyResult = { subscriptionId, days };
      await setCached(cacheKeySource, dailyResult);
      return { status: 200, jsonBody: dailyResult, headers: { "X-Cache": "MISS" } };
    }

    const filterDimension = request.query.get("filterDimension");
    const filterTagKey = request.query.get("filterTagKey");
    const filterValuesRaw = request.query.get("filterValues");
    const filterValues = filterValuesRaw
      ? filterValuesRaw.split(",").map((v) => v.trim()).filter(Boolean)
      : [];
    const filterBlank = request.query.get("filterBlank") === "true";

    if (filterBlank) {
      if (!filterDimension && !filterTagKey) {
        return { status: 400, jsonBody: { error: "filterBlank requires filterDimension or filterTagKey." } };
      }
      const primaryGrouping = filterTagKey
        ? { type: "TagKey", name: filterTagKey }
        : { type: "Dimension", name: filterDimension };
      const dualUrl = `${costScope.urlPrefix}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;
      const dualBody = {
        type: "ActualCost",
        timeframe: "Custom",
        timePeriod: { from, to },
        dataset: {
          granularity: "Monthly",
          aggregation: {
            totalCost: { name: "Cost", function: "Sum" },
            totalQuantity: { name: "UsageQuantity", function: "Sum" }
          },
          grouping: [primaryGrouping, { type: "Dimension", name: "ResourceId" }]
        }
      };
      if (subscriptionIdsFilter) dualBody.dataset.filter = withSubscriptionFilter(null);

      let dualData;
      try {
        dualData = await armPostAllPages(dualUrl, dualBody, context);
      } catch (e) {
        context.error(e);
        const stale = await getCachedStale(cacheKeySource);
        if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
        return { status: 502, jsonBody: { error: "Cost Management drill query failed", details: e.message } };
      }

      const dCols = dualData.properties.columns.map((c) => c.name);
      const dIdxCost = dCols.indexOf("Cost");
      const dIdxQuantity = dCols.indexOf("UsageQuantity");
      const dIdxBillingMonth = dCols.indexOf("BillingMonth");
      const dIdxUsageDate = dCols.indexOf("UsageDate");
      const dIdxDate = dIdxBillingMonth >= 0 ? dIdxBillingMonth : dIdxUsageDate;
      const dIdxResource = dCols.indexOf("ResourceId");
      const dIdxPrimary = filterTagKey
        ? (dCols.indexOf("TagValue") >= 0 ? dCols.indexOf("TagValue")
          : (dCols.indexOf("TagKey") >= 0 ? dCols.indexOf("TagKey") : dCols.indexOf(filterTagKey)))
        : dCols.indexOf(filterDimension);

      const months = monthsFromRows(dualData.properties.rows, (row, byMonth) => {
        let rawPrimary = dIdxPrimary >= 0 ? row[dIdxPrimary] : null;
        if (filterTagKey && typeof rawPrimary === "string" && rawPrimary.includes(":")) {
          rawPrimary = rawPrimary.slice(rawPrimary.indexOf(":") + 1);
        }
        if (rawPrimary) return;

        const month = dIdxDate >= 0 ? extractMonth(row[dIdxDate]) : "(unknown)";
        const rawResourceId = dIdxResource >= 0 ? row[dIdxResource] : null;
        const name = friendlyResourceName(rawResourceId);
        const cost = Number(row[dIdxCost]) || 0;
        const quantity = dIdxQuantity >= 0 ? Number(row[dIdxQuantity]) || 0 : 0;
        addToByMonth(byMonth, month, name, cost, rawResourceId || undefined, quantity, subIdFromResourceId(rawResourceId));
      });

      const dualResult = { subscriptionId, groupBy: "resource", months };
      await setCached(cacheKeySource, dualResult);
      return { status: 200, jsonBody: dualResult, headers: { "X-Cache": "MISS" } };
    }
    if (groupBy === "tag" && !tagKey) {
      return { status: 400, jsonBody: { error: "groupBy=tag requires &tagKey=<tag name> - Cost Management groups by one specific tag key at a time." } };
    }
    if (filterValues.length && !filterDimension && !filterTagKey) {
      return { status: 400, jsonBody: { error: "filterValues requires either filterDimension or filterTagKey." } };
    }

    const drillFilter = filterValues.length
      ? (filterTagKey
        ? { tags: { name: filterTagKey, operator: "In", values: filterValues } }
        : { dimensions: { name: filterDimension, operator: "In", values: filterValues } })
      : null;
    const combinedFilter = withSubscriptionFilter(drillFilter);

    let months;
    try {
      const result = await queryMonthlyBreakdown(costScope.urlPrefix, costScope.type, groupBy, tagKey, from, to, combinedFilter, context);
      months = result.months;
    } catch (e) {
      if (e.statusCode === 400) {
        return { status: 400, jsonBody: { error: e.message } };
      }
      context.error(e);
      const stale = await getCachedStale(cacheKeySource);
      if (stale) return { status: 200, jsonBody: stale, headers: { "X-Cache": "STALE" } };
      return { status: 502, jsonBody: { error: "Cost Management query failed", details: e.message } };
    }

    if (tenantWide) {
      try {
        months = await mergeTenantWideExtras(months, groupBy, tagKey, from.slice(0, 4), subscriptionIds, context);
      } catch (e) {
        context.warn("mergeTenantWideExtras failed, returning primary scope only: " + e.message);
      }
    }

    const result = { subscriptionId, groupBy, tagKey: groupBy === "tag" ? tagKey : undefined, months };
    await setCached(cacheKeySource, result);
    return { status: 200, jsonBody: result, headers: { "X-Cache": "MISS" } };
  }
});
