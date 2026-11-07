// Runs in GitHub Actions. Saves the official + EGP rates from open.er-api to
// rates.json as a backup for the app.
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

// The street rate is fetched by the app itself (sp-today blocks GitHub's servers).

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
