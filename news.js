// Probashi Duty Life news robot: collects expat news headlines for each Gulf country
// and saves them to news.json. Only headline, source, time and link are kept;
// tapping a headline opens the original news site.
// Runs on GitHub Actions together with the rate robot (see .github/workflows/rates.yml).
const fs = require("fs");

// Search words per country: Bengali (for Bengali readers) and English (for everyone else).
const COUNTRIES = {
  KW: { bn: "কুয়েত প্রবাসী", en: "Kuwait expats" },
  SA: { bn: "সৌদি আরব প্রবাসী", en: "Saudi Arabia expats" },
  AE: { bn: "(আমিরাত OR দুবাই) প্রবাসী", en: "UAE expats" },
  QA: { bn: "কাতার প্রবাসী", en: "Qatar expats" },
  BH: { bn: "বাহরাইন প্রবাসী", en: "Bahrain expats" },
};

// Owner's own blog (Blogger). Put the blog address here later, e.g. "https://example.blogspot.com".
// Posts with a label matching the country (Kuwait, Saudi, UAE, Qatar, Bahrain) show first for that
// country; posts labelled "All" show for every country.
const BLOG = "";
const BLOG_LABELS = { KW: "Kuwait", SA: "Saudi", AE: "UAE", QA: "Qatar", BH: "Bahrain" };

const PER_LIST = 12;

function feedUrl(q, lang) {
  const p = lang === "bn" ? "hl=bn&gl=BD&ceid=BD:bn" : "hl=en-US&gl=US&ceid=US:en";
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:7d") + "&" + p;
}

function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, "").trim();
}
function tag(block, name) {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">"));
  return m ? decode(m[1]) : "";
}

async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (ProbashiDutyLife news robot)" } });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r.text();
}

async function googleNews(q, lang) {
  const xml = await get(feedUrl(q, lang));
  const items = [];
  for (const block of xml.split("<item>").slice(1)) {
    let title = tag(block, "title");
    const source = tag(block, "source");
    // Google adds " - Source" at the end of the title; remove it because we show the source separately.
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const link = tag(block, "link");
    const at = Date.parse(tag(block, "pubDate")) || 0;
    if (title && /^https?:\/\//.test(link)) items.push({ t: title, s: source, u: link, at });
  }
  return items;
}

async function blogPosts(label) {
  if (!BLOG) return [];
  const url = BLOG.replace(/\/$/, "") + "/feeds/posts/default" + (label ? "/-/" + encodeURIComponent(label) : "") + "?alt=json&max-results=5";
  const j = JSON.parse(await get(url));
  return ((j.feed && j.feed.entry) || []).map(e => ({
    t: e.title.$t,
    s: "Probashi Blog",
    u: (e.link.find(l => l.rel === "alternate") || {}).href,
    at: Date.parse(e.published.$t) || 0,
    own: 1,
  })).filter(x => x.t && x.u);
}

function clean(list) {
  const seen = new Set();
  return list
    .filter(x => { const k = x.t.toLowerCase().replace(/\s+/g, " ").slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.own || 0) - (a.own || 0) || b.at - a.at)
    .slice(0, PER_LIST);
}

(async () => {
  let old = {};
  try { old = JSON.parse(fs.readFileSync("news.json", "utf8")); } catch (e) {}
  const out = { updated: new Date().toISOString(), cty: {} };
  for (const [code, q] of Object.entries(COUNTRIES)) {
    out.cty[code] = {};
    let own = [];
    try { own = (await blogPosts(BLOG_LABELS[code])).concat(await blogPosts("All")); } catch (e) { console.log("blog", code, e.message); }
    for (const lang of ["bn", "en"]) {
      try {
        const list = clean(own.concat(await googleNews(q[lang], lang)));
        out.cty[code][lang] = list;
        console.log(code, lang, list.length, list[0] ? list[0].t : "");
      } catch (e) {
        console.log("failed", code, lang, e.message);
        // Keep yesterday's headlines rather than showing nothing.
        out.cty[code][lang] = (old.cty && old.cty[code] && old.cty[code][lang]) || [];
      }
    }
  }
  fs.writeFileSync("news.json", JSON.stringify(out));
})();
