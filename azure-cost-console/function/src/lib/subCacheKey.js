function subCacheKey(subscriptionId, year, groupBy, tagKey) {
  return "sub|" + subscriptionId + "|" + year + "|" + groupBy + (groupBy === "tag" ? "|" + (tagKey || "") : "");
}

module.exports = { subCacheKey };
