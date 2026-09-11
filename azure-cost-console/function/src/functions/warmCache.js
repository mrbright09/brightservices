const { app } = require("@azure/functions");
const { queryMonthlyBreakdown } = require("../lib/costQuery");
const { getCached, setCached } = require("../lib/cache");
const { listAllSubscriptions } = require("../lib/allSubscriptions");
const { subCacheKey } = require("../lib/subCacheKey");

const DIMENSIONS = ["resourceGroup", "service", "resource"];
const YEARS_BACK = 2;
const PACE_MS = 1200;
const STATUS_KEY = "internal:warm-status";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildComboList(context) {
  const subs = await listAllSubscriptions(context);
  const now = new Date();
  const years = [];
  for (let i = 0; i <= YEARS_BACK; i++) years.push(now.getUTCFullYear() - i);

  const combos = [];
  for (const sub of subs) {
    for (const groupBy of DIMENSIONS) {
      for (const year of years) {
        combos.push({ subscriptionId: sub.id, subscriptionName: sub.name, groupBy, year });
      }
    }
  }
  return combos;
}

app.timer("warmCache", {
  schedule: "0 0 */4 * * *",
  handler: async (myTimer, context) => {
    if (process.env.AZURE_TENANT_WIDE !== "true") {
      context.log("warmCache: AZURE_TENANT_WIDE is not enabled, skipping run.");
      return;
    }

    const batchSize = Number(process.env.AZURE_WARM_BATCH_SIZE) || 350;
    const startedAt = new Date();

    let combos;
    try {
      combos = await buildComboList(context);
    } catch (e) {
      context.error("warmCache: failed to build combo list - " + e.message);
      return;
    }
    if (!combos.length) {
      context.warn("warmCache: no subscriptions discovered, nothing to warm.");
      return;
    }

    const statusBefore = (await getCached(STATUS_KEY, Infinity)) || { cursor: 0 };
    let cursor = statusBefore.cursor || 0;
    if (cursor >= combos.length) cursor = 0;

    const batch = [];
    for (let i = 0; i < batchSize && i < combos.length; i++) {
      batch.push(combos[(cursor + i) % combos.length]);
    }

    let succeeded = 0;
    let failed = 0;
    const failures = [];
    for (const combo of batch) {
      try {
        const urlPrefix = `https://management.azure.com/subscriptions/${combo.subscriptionId}`;
        const from = `${combo.year}-01-01`;
        const to = `${combo.year}-12-31`;
        const { months } = await queryMonthlyBreakdown(urlPrefix, "Subscription", combo.groupBy, null, from, to, null, context);
        await setCached(subCacheKey(combo.subscriptionId, String(combo.year), combo.groupBy, null), { months });
        succeeded++;
      } catch (e) {
        failed++;
        if (failures.length < 10) {
          failures.push({ subscriptionId: combo.subscriptionId, subscriptionName: combo.subscriptionName, groupBy: combo.groupBy, year: combo.year, error: e.message });
        }
      }
      await sleep(PACE_MS);
    }

    const newCursor = (cursor + batch.length) % combos.length;
    const completedFullCycle = newCursor <= cursor && batch.length > 0;

    const status = {
      cursor: newCursor,
      totalCombos: combos.length,
      subscriptionCount: new Set(combos.map((c) => c.subscriptionId)).size,
      lastRunAt: startedAt.toISOString(),
      lastRunSucceeded: succeeded,
      lastRunFailed: failed,
      lastRunFailureSample: failures,
      lastFullCycleCompletedAt: completedFullCycle ? new Date().toISOString() : (statusBefore.lastFullCycleCompletedAt || null)
    };
    await setCached(STATUS_KEY, status);
    context.log(`warmCache: processed ${batch.length} combos (${succeeded} ok, ${failed} failed), cursor ${cursor} -> ${newCursor} of ${combos.length}.`);
  }
});
