// DutyBook rate robot: opens exchange-house websites like a real browser,
// waits for rates to load, and saves them to rates.json.
// Runs on GitHub Actions on a schedule (see .github/workflows/rates.yml).
const { chromium } = require("playwright");
const fs = require("fs");

// Which exchange houses to read. url = page that shows rates after loading.
const SOURCES = [
  { id: "almulla", name: "Al Mulla Exchange", url: "https://www.almullaexchange.com/" },
  // LuLu: rate page shows empty tables to automated visitors; skipped until LuLu gives access.
  // BEC: its website firewall blocks automated visitors, so we don't read it (ask BEC for permission/API).
  { id: "muzaini", name: "Al Muzaini Exchange", url: "https://www.muzaini.com/" },
  // City International Exchange: website has a broken security certificate; skipped for now.
];

// Currencies we care about, with a sane range for "1 KWD = ?".
// A number outside the range is ignored (protects against reading a wrong number).
const CUR = {
  BDT: [300, 500], INR: [230, 350], PKR: [750, 1100], NPR: [380, 560],
  PHP: [150, 250], LKR: [800, 1100], EGP: [120, 220],
};

// Find "BDT ... 400.325" style pairs in any text (page text or JSON).
function extract(text, tag) {
  const out = {};
  for (const [code, [lo, hi]] of Object.entries(CUR)) {
    const re = new RegExp(code + "[^0-9]{0,80}?([0-9]{2,4}(?:\\.[0-9]{1,6})?)", "gi");
    let m;
    while ((m = re.exec(text))) {
      const v = parseFloat(m[1]);
      // Skip amounts like "500 KWD" in conversion tables: that is dinars, not a rate.
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
      if (/^[ \t]*([A-Z]{3}|KD|دينار)\b/.test(after)) continue;
      if (v >= lo && v <= hi) {
        out[code] = v;
        if (tag) console.log(tag, code, "context:", JSON.stringify(text.slice(Math.max(0, m.index - 100), m.index + 60)));
        break;
      }
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
    try {
      await page.goto(src.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) { console.log(src.id, "goto:", e.message.split("\n")[0]); }
    // Give the site time to load its rates after the page opens.
    await page.waitForTimeout(15000);
    const text = await page.innerText("body").catch(() => "");
    // Prefer numbers from the site's own data (JSON), then from visible text.
    const rates = Object.assign({}, extract(text, src.id + " text"), extract(jsonBits.join("\n"), src.id + " json"));
    if (!Object.keys(rates).length) {
      console.log(src.id, "title:", await page.title().catch(() => ""), "| json responses:", jsonBits.length);
      console.log(src.id, "text start:", JSON.stringify(text.slice(0, 700)));
    }
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
  // Some sites have certificate problems on www; this only affects reading public rate pages.
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
