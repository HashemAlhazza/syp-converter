// Runs in GitHub Actions. Gets the street USD rate from the sp-today API
// and the official + EGP rates from open.er-api, then writes rates.json.
import { readFile, writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function toNewSyp(n) {
  if (!isFinite(n) || n <= 0) return null;
  if (n > 1000) n = n / 100; // old SYP -> new SYP
  return n > 30 && n < 1000 ? Math.round(n * 100) / 100 : null;
}

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r;
}

let prev = {};
try { prev = JSON.parse(await readFile("rates.json", "utf8")); } catch {}

const out = { ...prev };
const now = new Date().toISOString();

// Street rate: sp-today's official API (key stored as the SPTODAY_API_KEY repo secret).
// Free tier = 100 requests/month, so the workflow runs every 8 hours.
const KEY = process.env.SPTODAY_API_KEY;
if (!KEY) console.log("SPTODAY_API_KEY secret is missing; street rate not updated");
else {
  try {
    const r = await fetch("https://api-v2.sp-today.com/api/v1/currency/usd?lang=en&city=damascus", {
      headers: { "X-API-Key": KEY, Accept: "application/json" },
    });
    console.log("sp-today API: HTTP", r.status, "remaining:", r.headers.get("x-ratelimit-remaining"));
    const j = await r.json();
    const d = j?.data?.currency?.cities?.damascus;
    const buy = toNewSyp(Number(d?.buy)), sell = toNewSyp(Number(d?.sell));
    if (j.ok && (buy || sell)) {
      out.street = { buy: buy ?? sell, sell: sell ?? buy, source: "sp-today.com", updated: j.data.currency.updated_at || now };
    } else console.log("Unexpected API response:", JSON.stringify(j).slice(0, 300));
  } catch (e) { console.log("sp-today API error:", e.message); }
}

try {
  const j = await (await get("https://open.er-api.com/v6/latest/USD")).json();
  const off = toNewSyp(j.rates.SYP);
  if (off) out.official = { mid: off, source: "open.er-api.com", updated: new Date(j.time_last_update_unix * 1000).toISOString() };
  if (j.rates.EGP) out.egp = { rate: j.rates.EGP, source: "open.er-api.com", updated: new Date(j.time_last_update_unix * 1000).toISOString() };
} catch (e) { console.log(e.message); }

delete out.history;

out.checked = now;
await writeFile("rates.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out));
