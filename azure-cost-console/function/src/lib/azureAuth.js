const { DefaultAzureCredential } = require("@azure/identity");

const credential = new DefaultAzureCredential();

let cached = null;

async function getArmToken() {
  if (cached && cached.expiresOnTimestamp - 60_000 > Date.now()) {
    return cached.token;
  }
  cached = await credential.getToken("https://management.azure.com/.default");
  return cached.token;
}

async function armGet(url, context) {
  const token = await getArmToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    context && context.warn(`ARM GET ${url} -> ${res.status}: ${text}`);
    throw new Error(`ARM GET ${url} failed: ${res.status}`);
  }
  return res.json();
}

async function armPost(url, body, context) {
  const token = await getArmToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    context && context.warn(`ARM POST ${url} -> ${res.status}: ${text}`);
    throw new Error(`ARM POST ${url} failed: ${res.status}`);
  }
  return res.json();
}

module.exports = { getArmToken, armGet, armPost };
