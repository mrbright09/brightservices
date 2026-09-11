const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

const CACHE_CONTAINER = "costcache";
const credential = new DefaultAzureCredential();
let containerClientPromise = null;

function getContainerClient() {
  if (!containerClientPromise) {
    const blobServiceUri = process.env.AzureWebJobsStorage__blobServiceUri;
    if (!blobServiceUri) {
      containerClientPromise = Promise.resolve(null);
    } else {
      const service = new BlobServiceClient(blobServiceUri, credential);
      const container = service.getContainerClient(CACHE_CONTAINER);
      containerClientPromise = container.createIfNotExists()
        .then(() => container)
        .catch(() => null);
    }
  }
  return containerClientPromise;
}

function hashKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return "q" + (h >>> 0).toString(16);
}

async function getCached(key, maxAgeMs) {
  const container = await getContainerClient();
  if (!container) return null;
  const blob = container.getBlockBlobClient(hashKey(key) + ".json");
  try {
    const props = await blob.getProperties();
    const age = Date.now() - new Date(props.lastModified).getTime();
    if (age > maxAgeMs) return null;
    const download = await blob.downloadToBuffer();
    return JSON.parse(download.toString("utf8"));
  } catch (e) {
    return null;
  }
}

async function getCachedStale(key) {
  const container = await getContainerClient();
  if (!container) return null;
  const blob = container.getBlockBlobClient(hashKey(key) + ".json");
  try {
    const download = await blob.downloadToBuffer();
    return JSON.parse(download.toString("utf8"));
  } catch (e) {
    return null;
  }
}

async function setCached(key, value) {
  const container = await getContainerClient();
  if (!container) return;
  const blob = container.getBlockBlobClient(hashKey(key) + ".json");
  try {
    const body = Buffer.from(JSON.stringify(value));
    await blob.uploadData(body, { blobHTTPHeaders: { blobContentType: "application/json" } });
  } catch (e) {
    // non-fatal
  }
}

module.exports = { getCached, setCached, getCachedStale };
