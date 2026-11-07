// Runs in GitHub Actions. Scrapes the street (market) USD rate from sp-today
// and the official rate from open.er-api, then writes rates.json.
import { readFile, writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function toNewSyp(n) {
  if (!isFinite(n) || n <= 0) return null;
  if (n > 1000) n = n / 100; // old SYP -> new SYP
  return n > 30 && n < 1000 ? Math.round(n * 100) / 100 : null;
}

export function parseStreet(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const grab = (labels) => {
    for (const l of labels) {
      const m = text.match(new RegExp(l + "[^0-9]{0,40}([0-9][0-9,]*\\.?[0-9]*)", "i"));
      if (m) {
        const v = toNewSyp(parseFloat(m[1].replace(/,/g, "")));
        if (v) return v;
      }
    }
    return null;
  };
  const buy = grab(["Buy", "شراء"]);
  const sell = grab(["Sell", "مبيع", "بيع"]);
  return buy || sell ? { buy: buy ?? sell, sell: sell ?? buy } : null;
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

for (const url of ["https://sp-today.com/en/currency/us_dollar", "https://sp-today.com/en"]) {
  try {
    const s = parseStreet(await (await get(url)).text());
    if (s) { out.street = { ...s, source: "sp-today.com", updated: now }; break; }
    console.log("No street rate found in", url);
  } catch (e) { console.log(e.message); }
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
