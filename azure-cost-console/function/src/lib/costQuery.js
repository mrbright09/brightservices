const { armPost, armGet } = require("./azureAuth");

const GROUP_BY_DIMENSIONS = {
  resourceGroup: "ResourceGroupName",
  service: "ServiceName",
  resource: "ResourceId"
};

function friendlyResourceName(resourceId) {
  if (!resourceId) return "(no resource)";
  const rid = String(resourceId).toLowerCase().replace(/\/+$/, "");
  const trimmed = String(resourceId).replace(/\/+$/, "");
  let m;
  if ((m = rid.match(/\/reservationorders\/([a-f0-9-]{36})$/))) return `[Reservation Order] ${m[1]}`;
  if ((m = rid.match(/\/reservationorders\/[a-f0-9-]{36}\/reservations\/([a-f0-9-]{36})/))) return `[Reservation] ${m[1]}`;
  if (rid.includes("/savingsplanorders/")) return "[Savings Plan] Compute Savings Plan";
  if ((m = rid.match(/\/microsoft\.security\/pricings\/(.+)$/))) return `[Defender] ${m[1]}`;
  if (rid.includes("/microsoft.security/")) return `[Security] ${trimmed.split("/").pop()}`;
  if (rid.includes("/microsoft.capacity/")) return `[Capacity] ${trimmed.split("/").pop()}`;
  if (rid.includes("/microsoft.insights/")) return `[Monitor] ${trimmed.split("/").pop()}`;
  if (rid.includes("/microsoft.support/")) return `[Support] ${trimmed.split("/").pop()}`;
  return trimmed.split("/").pop();
}

function extractMonth(raw) {
  const s = String(raw);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  return s.slice(0, 7);
}

function extractDay(raw) {
  const s = String(raw);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

function addToByMonth(byMonth, month, name, cost, id, quantity, subId) {
  if (!byMonth[month]) byMonth[month] = { month, total: 0, byName: {} };
  if (!byMonth[month].byName[name]) byMonth[month].byName[name] = { cost: 0, quantity: 0, id, subIds: [] };
  const entry = byMonth[month].byName[name];
  entry.cost += cost;
  entry.quantity += quantity || 0;
  if (subId && !entry.subIds.includes(subId)) entry.subIds.push(subId);
  byMonth[month].total += cost;
}

function subIdFromResourceId(resourceId) {
  if (!resourceId) return null;
  const m = /^\/subscriptions\/([^/]+)\//i.exec(String(resourceId));
  return m ? m[1] : null;
}

function monthsFromRows(rows, byMonthBuilder) {
  const byMonth = {};
  for (const row of rows || []) {
    byMonthBuilder(row, byMonth);
  }
  return Object.values(byMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      total: m.total,
      breakdown: Object.entries(m.byName)
        .map(([name, v]) => ({ name, cost: v.cost, quantity: v.quantity, id: v.id, subIds: v.subIds }))
        .sort((a, b) => b.cost - a.cost)
    }));
}

async function armPostAllPages(url, body, context) {
  const first = await armPost(url, body, context);
  const rows = (first.properties && first.properties.rows) || [];
  let nextLink = first.properties && first.properties.nextLink;
  while (nextLink) {
    const page = await armGet(nextLink, context);
    rows.push(...((page.properties && page.properties.rows) || []));
    nextLink = page.properties && page.properties.nextLink;
  }
  return { properties: { columns: first.properties.columns, rows } };
}

async function queryMonthlyBreakdown(urlPrefix, scopeType, groupBy, tagKey, from, to, subscriptionIdsFilter, context) {
  if (groupBy === "tag" && !tagKey) {
    throw Object.assign(new Error("groupBy=tag requires a tagKey"), { statusCode: 400 });
  }
  if (groupBy !== "tag" && !GROUP_BY_DIMENSIONS[groupBy]) {
    throw Object.assign(new Error(`Unknown groupBy "${groupBy}"`), { statusCode: 400 });
  }

  const grouping = groupBy === "tag"
    ? [{ type: "TagKey", name: tagKey }]
    : [{ type: "Dimension", name: GROUP_BY_DIMENSIONS[groupBy] }];
  if (scopeType === "ManagementGroup" && groupBy !== "resource") {
    grouping.push({ type: "Dimension", name: "SubscriptionId" });
  }

  const url = `${urlPrefix}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;
  const body = {
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from, to },
    dataset: {
      granularity: "Monthly",
      aggregation: {
        totalCost: { name: "Cost", function: "Sum" },
        totalQuantity: { name: "UsageQuantity", function: "Sum" }
      },
      grouping
    }
  };
  if (subscriptionIdsFilter) body.dataset.filter = subscriptionIdsFilter;

  const data = await armPostAllPages(url, body, context);

  const cols = data.properties.columns.map((c) => c.name);
  const idxCost = cols.indexOf("Cost");
  const idxQuantity = cols.indexOf("UsageQuantity");
  const idxBillingMonth = cols.indexOf("BillingMonth");
  const idxUsageDate = cols.indexOf("UsageDate");
  const idxDate = idxBillingMonth >= 0 ? idxBillingMonth : idxUsageDate;
  const idxGroup = groupBy === "tag"
    ? (cols.indexOf("TagValue") >= 0 ? cols.indexOf("TagValue")
      : (cols.indexOf("TagKey") >= 0 ? cols.indexOf("TagKey") : cols.indexOf(tagKey)))
    : cols.indexOf(GROUP_BY_DIMENSIONS[groupBy]);
  const idxSubId = cols.indexOf("SubscriptionId");
  const scopeSubId = scopeType === "Subscription" ? urlPrefix.split("/subscriptions/")[1] : null;

  const months = monthsFromRows(data.properties.rows, (row, byMonth) => {
    const month = idxDate >= 0 ? extractMonth(row[idxDate]) : "(unknown)";

    let rawName = idxGroup >= 0 ? row[idxGroup] : null;
    if (groupBy === "tag" && typeof rawName === "string" && rawName.includes(":")) {
      rawName = rawName.slice(rawName.indexOf(":") + 1);
    }
    const name = groupBy === "resource"
      ? friendlyResourceName(rawName)
      : rawName || (groupBy === "tag" ? "(untagged)" : "(none)");
    const cost = Number(row[idxCost]) || 0;
    const quantity = idxQuantity >= 0 ? Number(row[idxQuantity]) || 0 : 0;
    const resourceId = groupBy === "resource" ? rawName || undefined : undefined;
    const subId = groupBy === "resource"
      ? subIdFromResourceId(rawName)
      : (idxSubId >= 0 ? row[idxSubId] : scopeSubId);

    addToByMonth(byMonth, month, name, cost, resourceId, quantity, subId);
  });

  return { months };
}

module.exports = {
  GROUP_BY_DIMENSIONS,
  friendlyResourceName,
  extractMonth,
  extractDay,
  addToByMonth,
  subIdFromResourceId,
  monthsFromRows,
  armPostAllPages,
  queryMonthlyBreakdown
};
