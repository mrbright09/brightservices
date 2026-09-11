const { app } = require("@azure/functions");
const { getCached } = require("../lib/cache");

app.http("warmStatus", {
  methods: ["GET"],
  authLevel: "function",
  route: "warmStatus",
  handler: async () => {
    const status = await getCached("internal:warm-status", Infinity);
    if (!status) {
      return { status: 200, jsonBody: { enabled: process.env.AZURE_TENANT_WIDE === "true", started: false } };
    }
    return {
      status: 200,
      jsonBody: {
        enabled: process.env.AZURE_TENANT_WIDE === "true",
        started: true,
        subscriptionCount: status.subscriptionCount,
        totalCombos: status.totalCombos,
        coveragePct: status.totalCombos ? Math.round((status.cursor / status.totalCombos) * 1000) / 10 : null,
        lastRunAt: status.lastRunAt,
        lastRunSucceeded: status.lastRunSucceeded,
        lastRunFailed: status.lastRunFailed,
        lastFullCycleCompletedAt: status.lastFullCycleCompletedAt
      }
    };
  }
});
