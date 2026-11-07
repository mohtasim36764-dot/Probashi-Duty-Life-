// DutyBook rate robot: opens exchange-house websites like a real browser,
// waits for rates to load, and saves them to rates.json.
// Runs on GitHub Actions on a schedule (see .github/workflows/rates.yml).
const { chromium } = require("playwright");
const fs = require("fs");

// Which exchange houses to read. url = page that shows rates after loading.
const SOURCES = [
  { id: "almulla", name: "Al Mulla Exchange", url: "https://www.almullaexchange.com/" },
  { id: "lulu", name: "LuLu Exchange", url: "https://luluexchange.com/kuwait/ar/currency-converter/kwd-to-bdt/" },
  { id: "bec", name: "BEC Exchange", url: "https://www.bec.com.kw/" },
  { id: "muzaini", name: "Al Muzaini Exchange", url: "https://www.muzaini.com/" },
  { id: "city", name: "City International Exchange", url: "https://www.cityinternationalexchange.com/" },
];

// Currencies we care about, with a sane range for "1 KWD = ?".
// A number outside the range is ignored (protects against reading a wrong number).
const CUR = {
  BDT: [300, 500], INR: [230, 350], PKR: [750, 1100], NPR: [380, 560],
  PHP: [150, 250], LKR: [800, 1100], EGP: [120, 220],
};

// Find "BDT ... 400.325" style pairs in any text (page text or JSON).
function extract(text) {
  const out = {};
  for (const [code, [lo, hi]] of Object.entries(CUR)) {
    const re = new RegExp(code + "[^0-9]{0,80}?([0-9]{2,4}(?:\\.[0-9]{1,6})?)", "gi");
    let m;
    while ((m = re.exec(text))) {
      const v = parseFloat(m[1]);
      if (v >= lo && v <= hi) { out[code] = v; break; }
    }
  }
  return out;
}

async function readSource(browser, src) {
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  });
  const jsonBits = [];
  page.on("response", async (r) => {
    try {
      const ct = r.headers()["content-type"] || "";
      if (ct.includes("json")) jsonBits.push((await r.text()).slice(0, 200000));
    } catch (_) {}
  });
  try {
    await page.goto(src.url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(4000);
    const text = await page.innerText("body").catch(() => "");
    // Prefer numbers from the site's own data (JSON), then from visible text.
    const rates = Object.assign({}, extract(text), extract(jsonBits.join("\n")));
    // Debug copy so we can see what the site looked like if reading fails.
    fs.mkdirSync("debug", { recursive: true });
    fs.writeFileSync(`debug/${src.id}.txt`, text.slice(0, 50000));
    fs.writeFileSync(`debug/${src.id}.json.txt`, jsonBits.join("\n---\n").slice(0, 500000));
    return rates;
  } finally {
    await page.close();
  }
}

// Market reference rate (not an exchange house rate), from a free public API.
async function reference() {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/KWD");
    const j = await r.json();
    const out = {};
    for (const c of Object.keys(CUR)) if (j.rates && j.rates[c]) out[c] = j.rates[c];
    return out;
  } catch (_) { return {}; }
}

(async () => {
  const old = fs.existsSync("rates.json") ? JSON.parse(fs.readFileSync("rates.json", "utf8")) : { houses: {} };
  const now = new Date().toISOString();
  const result = { updated: now, reference: await reference(), houses: {} };
  const browser = await chromium.launch();
  let okCount = 0;
  for (const src of SOURCES) {
    let rates = {};
    try { rates = await readSource(browser, src); } catch (e) { console.log(src.id, "error:", e.message); }
    if (Object.keys(rates).length) {
      okCount++;
      result.houses[src.id] = { name: src.name, url: src.url, rates, at: now };
    } else if (old.houses && old.houses[src.id]) {
      // Keep the last good rate, marked as old, so the app never shows empty.
      result.houses[src.id] = Object.assign({}, old.houses[src.id], { stale: true });
    }
    console.log(src.id, JSON.stringify(rates));
  }
  await browser.close();
  fs.writeFileSync("rates.json", JSON.stringify(result, null, 2));
  // Fail the run if no exchange house could be read: GitHub then emails the owner.
  if (okCount === 0) { console.log("No exchange house could be read"); process.exit(1); }
})();
