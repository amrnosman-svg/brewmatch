#!/usr/bin/env node
// BrewHarbor static page generator.
// Usage:  node scripts/generate.js            (uses https://getbrewharbor.com)
//         BASE_URL=https://newdomain.com node scripts/generate.js
// Refresh data first:  curl -s $BASE_URL/.netlify/functions/airtable > data/machines.raw.json
// Source of truth stays Airtable; data/machines.raw.json is a build snapshot.
// Output (all committed): machines/, compare/, assets/pages.css, machines.json,
//                         sitemap.xml, robots.txt, llms.txt

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.BASE_URL || 'https://getbrewharbor.com').replace(/\/$/, '');
const TODAY = process.env.LASTMOD || new Date().toISOString().slice(0, 10);

// Specs still awaiting verification (see project notes) — width and brew temp are NOT published for these.
const UNVERIFIED_SPECS = new Set([
  'De\'Longhi La Specialista Arte Evo', // width carried over from the Arte; Evo not checked
  'Philips 4400 LatteGo', 'Philips 5500 LatteGo', // width inferred from the LatteGo family; Philips spec page did not load
]);
// Added Oct 2026: widths are verified from retailer or review specs, but brewing temperatures are sibling-based estimates
// used by the quiz only, so they are not shown on public pages until verified.
const UNVERIFIED_TEMP = new Set(['Philips 4400 LatteGo', 'Philips 5500 LatteGo', 'Takeya Deluxe Cold Brew Coffee Maker']);

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/machines.raw.json'), 'utf8'));

// ---- image map: parse the live IMAGE_MAP literal out of index.html (single source of truth) ----
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const imgStart = html.indexOf('const IMAGE_MAP = {');
const imgEnd = html.indexOf('};', imgStart);
const IMAGE_MAP = new Function('return ' + html.slice(imgStart + 'const IMAGE_MAP = '.length, imgEnd + 1))();

// ---- helpers ----
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sel = v => (v && typeof v === 'object' && v.name) ? v.name : (v || '');
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const list = v => v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [];
const sym = { us: '$', ca: 'CA$', uk: '£', eu: '€', au: 'A$' };
const REGIONS = [['us', 'USD', 'priceUSD', 'buyLinkUS'], ['ca', 'CAD', 'priceCAD', 'buyLinkCA'], ['uk', 'GBP', 'priceGBP', 'buyLinkUK'], ['eu', 'EUR', 'priceEUR', 'buyLinkEU'], ['au', 'AUD', 'priceAUD', 'buyLinkAU']];
const money = (n, r) => sym[r] + Math.round(n).toLocaleString('en-US');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ---- normalise ----
const machines = raw.map(r => r.fields)
  .filter(f => f.active === true && f.name)
  .map(f => {
    const verified = !UNVERIFIED_SPECS.has(f.name);
    const m = {
      name: f.name,
      slug: slugify(f.name),
      brand: f.brand || '',
      category: sel(f.category),
      automation: sel(f.automationLevel),
      milk: sel(f.milkSystem) || 'none',
      maintenance: sel(f.maintenanceLevel),
      learning: sel(f.learningCurve),
      width: verified ? num(f.widthInches) : null,
      brewTemp: verified && !UNVERIFIED_TEMP.has(f.name) ? num(f.brewTempMax) : null,
      lifespan: num(f.expectedLifespanYears),
      annualMaint: num(f.maintenanceAnnualCost),
      cupCost: num(f.costPerCup),
      scores: {
        quality: num(f.qualityScore), espresso: num(f.espressoQualityScore), speed: num(f.speedScore),
        ease: num(f.easeOfUse), variety: num(f.varietyScore), eco: num(f.ecoScore), repair: num(f.ecoRepairScore),
      },
      drinks: list(f.drinkTypes),
      coffeeTypes: list(f.coffeeTypeMatch),
      compact: !!f.compact,
      description: f.description || '',
      sentiment: f.sentiment || '',
      prices: {}, links: {},
    };
    for (const [r, , pf, lf] of REGIONS) {
      if (num(f[pf]) != null) m.prices[r] = num(f[pf]);
      if (f[lf] && f[lf] !== '#') m.links[r] = f[lf];
    }
    const img = IMAGE_MAP[f.name];
    m.image = img && fs.existsSync(path.join(ROOT, img)) ? img : null;
    m.url = `/machines/${m.slug}/`;
    return m;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// slug collision guard
const seen = new Set();
for (const m of machines) { if (seen.has(m.slug)) throw new Error('duplicate slug ' + m.slug); seen.add(m.slug); }

// ---- derived, rule-based strengths / watch-outs (transparent thresholds, no invented claims) ----
function insights(m) {
  const s = m.scores, up = [], down = [];
  if (s.quality >= 4) up.push(`High cup-quality score (${s.quality}/5)`);
  if (s.espresso >= 4) up.push(`Strong espresso quality (${s.espresso}/5)`);
  if (s.speed >= 4) up.push(`Fast to a finished drink (speed ${s.speed}/5)`);
  if (s.ease >= 4) up.push(`Easy to use day to day (${s.ease}/5)`);
  if (s.variety >= 4) up.push(`Wide drink variety (${s.variety}/5)`);
  if (s.repair >= 4) up.push(`Repairable and long-lived (repairability ${s.repair}/5)`);
  if (s.eco >= 4) up.push(`Low environmental impact (eco ${s.eco}/5)`);
  if (m.compact) up.push('Compact footprint');
  if (m.cupCost != null && m.cupCost <= 0.4) up.push(`Low running cost (about $${m.cupCost.toFixed(2)} per cup for coffee)`);
  if (/^(high|hard|steep)/i.test(m.learning)) down.push(`Steep learning curve (${m.learning})`);
  if (/^high/i.test(m.maintenance)) down.push('High maintenance demands');
  if (s.speed != null && s.speed <= 2) down.push(`Slow (speed ${s.speed}/5)`);
  if (s.ease != null && s.ease <= 2) down.push(`Not especially easy to use (${s.ease}/5)`);
  if (s.eco != null && s.eco <= 2) down.push(`Weak environmental score (${s.eco}/5)`);
  if (s.repair != null && s.repair <= 2) down.push(`Hard to repair (${s.repair}/5)`);
  if (s.variety != null && s.variety <= 2) down.push(`Limited drink variety (${s.variety}/5)`);
  if (m.width != null && m.width >= 15) down.push(`Wide machine (${m.width}" across)`);
  if (m.cupCost != null && m.cupCost >= 0.8) down.push(`Higher running cost (about $${m.cupCost.toFixed(2)} per cup)`);
  if (m.lifespan != null && m.lifespan <= 4) down.push(`Shorter expected lifespan (${m.lifespan} years)`);
  if (m.prices.us >= 1500) down.push('Premium price');
  return { up: up.slice(0, 5), down: down.slice(0, 5) };
}

// ---- shared layout ----
const CSS = `:root{--black:#2C2416;--white:#FAF8F4;--off-white:#F0EBE0;--light-grey:#E4DDD0;--mid-grey:#7A6E5F;--dark-grey:#4A3F32;--gold:#C9A84C}
@media (prefers-color-scheme:dark){:root{--black:#F0EBE0;--white:#1E1A14;--off-white:#2A241B;--light-grey:#3A3226;--mid-grey:#A89C8A;--dark-grey:#D4CBB8}}
*{box-sizing:border-box}html,body{margin:0}
body{font-family:'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--white);color:var(--black);line-height:1.6;font-weight:300}
a{color:var(--black)}
.wrap{max-width:860px;margin:0 auto;padding:24px 20px 64px}
.top{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--light-grey);font-size:14px}
.top a{text-decoration:none;font-weight:500;letter-spacing:.02em}
.brand{display:flex;align-items:center;gap:10px}.brand img{display:block}
.crumbs{font-size:12px;color:var(--mid-grey);margin:8px 0 20px}.crumbs a{color:var(--mid-grey)}
h1{font-size:32px;line-height:1.2;font-weight:500;margin:0 0 8px}
h2{font-size:18px;font-weight:500;margin:36px 0 12px}
.lede{font-size:17px;color:var(--dark-grey);margin:0 0 20px}
.hero{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start;margin-bottom:8px}
.hero img{width:100%;height:auto;border-radius:8px;background:var(--off-white)}
@media(max-width:600px){.hero{grid-template-columns:1fr}.hero img{max-width:220px}}
.pill{display:inline-block;font-size:12px;border:1px solid var(--light-grey);border-radius:20px;padding:2px 11px;margin:0 6px 6px 0;color:var(--dark-grey)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--light-grey);vertical-align:top}
th{font-weight:500;width:38%;color:var(--dark-grey)}
.cmp th,.cmp td{width:auto}.cmp thead th{font-weight:500;color:var(--black)}
.scroll{overflow-x:auto}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:600px){.cols{grid-template-columns:1fr}}
ul{padding-left:20px;margin:0}li{margin:4px 0}
.btn{display:inline-block;background:var(--black);color:var(--white);padding:11px 20px;border-radius:6px;text-decoration:none;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:400;margin:4px 8px 4px 0}
.btn.alt{background:transparent;color:var(--black);border:1px solid var(--black)}
.btn:hover{opacity:.85}
.regions{font-size:13px;color:var(--mid-grey);margin-top:8px}
.note{font-size:12px;color:var(--mid-grey);margin-top:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding:0;list-style:none}
.grid li{margin:0}.grid a{display:block;border:1px solid var(--light-grey);border-radius:8px;padding:12px 14px;text-decoration:none;height:100%}
.grid a:hover{border-color:var(--black)}.grid small{display:block;color:var(--mid-grey);font-size:12px}
footer{border-top:1px solid var(--light-grey);padding:20px;text-align:center;font-size:12px;color:var(--mid-grey)}footer a{color:inherit}`;

function layout({ title, desc, canonical, body, jsonld, ogImage }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(BASE + canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(BASE + canonical)}">
<meta property="og:image" content="${esc(BASE + '/' + (ogImage || 'assets/og-image.png'))}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#2C2416">
<link rel="alternate" type="application/json" href="${BASE}/machines.json" title="BrewHarbor machine data">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/pages.css">
<script src="/assets/consent.js" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<div class="top"><a class="brand" href="/"><picture><source srcset="/assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/assets/logo.svg" alt="" width="30" height="30"></picture>BrewHarbor</a><a href="/">Take the quiz →</a></div>
<div class="wrap">
${body}
</div>
<footer>© 2026 BrewHarbor · Prices are estimates; check the retailer for current prices · <a href="/machines/">All machines</a> · <a href="/guides/real-cost-of-coffee/">Cost guide</a> · <a href="/privacy.html">Privacy</a> · <a href="#" onclick="if(window.bhConsent){bhConsent.open();}return false;">Cookie settings</a></footer>
</body>
</html>
`;
}

const stars5 = n => n == null ? '—' : `${n}/5`;
// Price tiers, same scale as the quiz page: Amazon only allows exact prices that it serves or that come from its API.
const TIERS = [[150, 'Budget'], [400, 'Mid-range'], [900, 'Upper mid-range'], [1800, 'Premium'], [Infinity, 'Prosumer']];
const FX = { us: 1, ca: 1.43, uk: 0.76, eu: 0.86, au: 1.55 };
const tierOf = m => {
  for (const r of ['us', 'ca', 'uk', 'eu', 'au']) {
    if (m.prices[r] != null) { const usd = m.prices[r] / FX[r]; const i = TIERS.findIndex(([max]) => usd < max); return { i, label: TIERS[i][1], dots: '●'.repeat(i + 1) + '○'.repeat(4 - i) }; }
  }
  return null;
};
const tierLabel = m => { const t = tierOf(m); return t ? t.label : ''; };
const priceLine = m => { const t = tierOf(m); return t ? `${t.label} price range` : 'price varies'; };

// ---- machine page ----
function specRows(m) {
  const rows = [
    ['Brand', m.brand], ['Type', m.category], ['Automation', cap(m.automation)],
    ['Milk system', m.milk && m.milk !== 'none' ? cap(m.milk) : 'None'],
    ['Width', m.width != null ? `${m.width} in` : null],
    ['Max brew temperature', m.brewTemp != null ? `${m.brewTemp} °C` : null],
    ['Learning curve', m.learning], ['Maintenance level', cap(m.maintenance)],
    ['Expected lifespan', m.lifespan != null ? `${m.lifespan} years` : null],
    ['Annual maintenance cost (est.)', m.annualMaint != null ? `$${m.annualMaint}` : null],
    ['Cost per cup (est.)', m.cupCost != null ? `$${m.cupCost.toFixed(2)}` : null],
    ['Works with', m.coffeeTypes.length ? m.coffeeTypes.map(cap).join(', ') : null],
    ['Drinks', m.drinks.length ? m.drinks.map(cap).join(', ') : null],
  ];
  return rows.filter(r => r[1]).map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('\n');
}
function scoreRows(m) {
  const s = m.scores;
  return [['Cup quality', s.quality], ['Espresso quality', s.espresso], ['Speed', s.speed], ['Ease of use', s.ease], ['Drink variety', s.variety], ['Eco score', s.eco], ['Repairability', s.repair]]
    .filter(r => r[1] != null).map(r => `<tr><th>${r[0]}</th><td>${stars5(r[1])}</td></tr>`).join('\n');
}
function buyButtons(m) {
  const order = REGIONS.filter(([r]) => m.links[r]);
  if (!order.length) return '';
  const first = order[0];
  const primary = m.links.us ? ['us', 'USD'] : [first[0], first[1]];
  const rest = order.filter(([r]) => r !== primary[0]);
  return `<p><a class="btn" href="${esc(m.links[primary[0]])}" target="_blank" rel="sponsored nofollow noopener">Check price on Amazon (${primary[1]})</a><a class="btn alt" href="/">Is it right for you? Take the quiz</a></p>` +
    (rest.length ? `<p class="regions">Other regions: ${rest.map(([r, c]) => `<a href="${esc(m.links[r])}" target="_blank" rel="sponsored nofollow noopener">${c}</a>`).join(' · ')}</p>` : '');
}
function machineDesc(m) {
  const base = m.description || `${m.name} ${m.category ? m.category.toLowerCase() : 'coffee machine'} specs, scores, strengths and watch-outs.`;
  return base.length > 158 ? base.slice(0, 155).replace(/\s+\S*$/, '') + '…' : base;
}
function relatedFor(m) {
  return machines.filter(x => x !== m && x.category === m.category && m.prices.us != null && x.prices.us != null)
    .sort((a, b) => Math.abs(a.prices.us - m.prices.us) - Math.abs(b.prices.us - m.prices.us)).slice(0, 4);
}
function machinePage(m, compareIdx) {
  const ins = insights(m);
  const related = relatedFor(m);
  const cmps = (compareIdx[m.slug] || []).slice(0, 4);
  const body = `<div class="crumbs"><a href="/">BrewHarbor</a> › <a href="/machines/">Machines</a> › ${esc(m.name)}</div>
<div class="hero">${m.image ? `<img src="/${esc(m.image)}" alt="${esc(m.name)}" width="400" height="400" loading="eager">` : '<div></div>'}
<div><h1>${esc(m.name)}</h1>
<p class="lede">${esc(m.description)}</p>
<div>${m.category ? `<span class="pill">${esc(m.category)}</span>` : ''}${m.compact ? '<span class="pill">Compact</span>' : ''}${tierOf(m) ? `<span class="pill">${priceLine(m)}</span>` : ''}</div></div></div>
${buyButtons(m)}
${m.sentiment ? `<h2>Who it's for</h2><p>${esc(m.sentiment)}</p>` : ''}
${(ins.up.length || ins.down.length) ? `<div class="cols">${ins.up.length ? `<div><h2>Strengths</h2><ul>${ins.up.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${ins.down.length ? `<div><h2>Watch-outs</h2><ul>${ins.down.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
<h2>Specs</h2><div class="scroll"><table>${specRows(m)}</table></div>
<h2>BrewHarbor scores</h2><div class="scroll"><table>${scoreRows(m)}</table></div>
<p class="note">Scores are BrewHarbor's own 1–5 ratings (5 is best) from specs, owner sentiment and teardown/repair data; they are the same scores the quiz uses to rank machines.</p>
<p class="note">We don't show prices because they change daily. Use the buy button to see today's price on Amazon.</p>
${cmps.length ? `<h2>Compare</h2><ul>${cmps.map(c => `<li><a href="${c.url}">${esc(c.title)}</a></li>`).join('')}</ul>` : ''}
${related.length ? `<h2>Similar machines</h2><ul class="grid">${related.map(x => `<li><a href="${x.url}">${esc(x.name)}<small>${esc(x.category)}${tierLabel(x) ? ' · ' + tierLabel(x) : ''}</small></a></li>`).join('')}</ul>` : ''}
<p class="note">Affiliate disclosure: links to Amazon are affiliate links. BrewHarbor has no sponsored placements; machines are ranked by the same scoring for everyone.</p>`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: m.name,
    ...(m.brand ? { brand: { '@type': 'Brand', name: m.brand } } : {}),
    description: m.description, category: m.category,
    ...(m.image ? { image: `${BASE}/${m.image}` } : {}),
    url: BASE + m.url,
    additionalProperty: [
      ...(m.width != null ? [{ '@type': 'PropertyValue', name: 'Width', value: m.width, unitText: 'in' }] : []),
      ...(m.brewTemp != null ? [{ '@type': 'PropertyValue', name: 'Max brew temperature', value: m.brewTemp, unitText: 'C' }] : []),
      ...(m.lifespan != null ? [{ '@type': 'PropertyValue', name: 'Expected lifespan', value: m.lifespan, unitText: 'years' }] : []),
      ...(m.milk ? [{ '@type': 'PropertyValue', name: 'Milk system', value: m.milk }] : []),
    ],
  };
  return layout({ title: `${m.name} — specs, scores & who it's for | BrewHarbor`, desc: machineDesc(m), canonical: m.url, body, jsonld, ogImage: m.image });
}

// ---- comparisons ----
const CURATED = [
  ['Breville Barista Express', 'Breville Barista Pro'], ['Breville Bambino Plus', 'Gaggia Classic Pro'],
  ['Jura E6', 'Jura E8'], ['Breville Barista Touch', 'Breville Barista Touch Impress'],
  ['De\'Longhi Magnifica Evo', 'De\'Longhi Dinamica Plus'], ['Hario V60', 'Chemex 6-Cup'],
  ['AeroPress Go', 'AeroPress Original'], ['Fellow Aiden Precision Brewer', 'Breville Precision Brewer'],
];
function pickPairs() {
  const byName = Object.fromEntries(machines.map(m => [m.name, m]));
  const used = new Set(), pairs = [];
  const add = (a, b) => {
    const [x, y] = [a, b].sort((p, q) => p.slug.localeCompare(q.slug));
    const k = x.slug + '|' + y.slug; if (used.has(k) || x === y) return; used.add(k); pairs.push([x, y]);
  };
  for (const [a, b] of CURATED) if (byName[a] && byName[b]) add(byName[a], byName[b]);
  // nearest-price same-category neighbours, tight gap only
  const cand = [];
  for (const m of machines) {
    if (m.prices.us == null) continue;
    const n = machines.filter(x => x !== m && x.category === m.category && x.prices.us != null)
      .map(x => ({ x, gap: Math.abs(x.prices.us - m.prices.us) / Math.max(x.prices.us, m.prices.us) }))
      .sort((p, q) => p.gap - q.gap)[0];
    if (n && n.gap <= 0.15) cand.push({ a: m, b: n.x, gap: n.gap });
  }
  cand.sort((p, q) => p.gap - q.gap);
  for (const c of cand) { if (pairs.length >= 36) break; add(c.a, c.b); }
  return pairs;
}
function winnerMark(a, b, better) { return (a == null || b == null || a === b) ? ['', ''] : (better(a, b) ? ['✓ ', ''] : ['', '✓ ']); }
function comparePage(a, b) {
  const slug = `${a.slug}-vs-${b.slug}`, url = `/compare/${slug}/`;
  const rows = [];
  const row = (label, va, vb) => { if (va == null && vb == null) return; rows.push(`<tr><th>${esc(label)}</th><td>${esc(va == null ? '—' : va)}</td><td>${esc(vb == null ? '—' : vb)}</td></tr>`); };
  const scoreRow = (label, k) => {
    const [ma, mb] = winnerMark(a.scores[k], b.scores[k], (x, y) => x > y);
    if (a.scores[k] == null && b.scores[k] == null) return;
    rows.push(`<tr><th>${label}</th><td>${ma}${stars5(a.scores[k])}</td><td>${mb}${stars5(b.scores[k])}</td></tr>`);
  };
  row('Type', a.category, b.category); row('Automation', cap(a.automation), cap(b.automation));
  row('Milk system', cap(a.milk), cap(b.milk));
  row('Price range', tierLabel(a) || null, tierLabel(b) || null);
  row('Width', a.width != null ? a.width + ' in' : null, b.width != null ? b.width + ' in' : null);
  row('Learning curve', a.learning, b.learning); row('Maintenance level', cap(a.maintenance), cap(b.maintenance));
  row('Expected lifespan', a.lifespan != null ? a.lifespan + ' yrs' : null, b.lifespan != null ? b.lifespan + ' yrs' : null);
  row('Cost per cup (est.)', a.cupCost != null ? '$' + a.cupCost.toFixed(2) : null, b.cupCost != null ? '$' + b.cupCost.toFixed(2) : null);
  scoreRow('Cup quality', 'quality'); scoreRow('Espresso quality', 'espresso'); scoreRow('Speed', 'speed'); scoreRow('Ease of use', 'ease');
  scoreRow('Drink variety', 'variety'); scoreRow('Eco score', 'eco'); scoreRow('Repairability', 'repair');
  const ia = insights(a), ib = insights(b);
  const title = `${a.name} vs ${b.name}`;
  const body = `<div class="crumbs"><a href="/">BrewHarbor</a> › <a href="/machines/">Machines</a> › ${esc(title)}</div>
<h1>${esc(title)}</h1>
<p class="lede">A side-by-side of specs and BrewHarbor scores. A ✓ marks the higher score; blanks mean no verified data.</p>
<div class="scroll"><table class="cmp"><thead><tr><th></th><th><a href="${a.url}">${esc(a.name)}</a></th><th><a href="${b.url}">${esc(b.name)}</a></th></tr></thead><tbody>${rows.join('\n')}</tbody></table></div>
<div class="cols"><div><h2>${esc(a.name)}</h2>${ia.up.length ? `<ul>${ia.up.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${ia.down.length ? `<p><strong>Watch-outs</strong></p><ul>${ia.down.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${a.sentiment ? `<p>${esc(a.sentiment)}</p>` : ''}</div>
<div><h2>${esc(b.name)}</h2>${ib.up.length ? `<ul>${ib.up.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${ib.down.length ? `<p><strong>Watch-outs</strong></p><ul>${ib.down.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${b.sentiment ? `<p>${esc(b.sentiment)}</p>` : ''}</div></div>
<p><a class="btn" href="${a.url}">${esc(a.name)} details</a><a class="btn" href="${b.url}">${esc(b.name)} details</a><a class="btn alt" href="/">Take the quiz</a></p>
<p class="note">Scores are BrewHarbor's own 1–5 ratings (5 is best). Affiliate disclosure: links to Amazon on the machine pages are affiliate links; there are no sponsored placements.</p>`;
  return {
    slug, url, title,
    html: layout({ title: `${title}: which is better? | BrewHarbor`, desc: `${title} compared on specs, price, maintenance, cup quality and running costs.`, canonical: url, body, jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: BASE + url } }),
  };
}

// ---- directory ----
function directoryPage(compares) {
  const cats = [...new Set(machines.map(m => m.category))].sort();
  const body = `<div class="crumbs"><a href="/">BrewHarbor</a> › Machines</div>
<h1>All coffee machines</h1>
<p class="lede">${machines.length} machines scored on cup quality, speed, ease of use, variety, eco impact and repairability. Not sure which fits? <a href="/">Take the 7-question quiz</a>. Or read <a href="/guides/real-cost-of-coffee/">what a coffee habit really costs per year</a>.</p>
${cats.map(c => `<h2>${esc(c)}</h2><ul class="grid">${machines.filter(m => m.category === c).map(m => `<li><a href="${m.url}">${esc(m.name)}<small>${tierLabel(m)}</small></a></li>`).join('')}</ul>`).join('\n')}
<h2>Comparisons</h2><ul>${compares.map(c => `<li><a href="${c.url}">${esc(c.title)}</a></li>`).join('')}</ul>`;
  return layout({
    title: 'All coffee machines: specs, scores & comparisons | BrewHarbor',
    desc: `Browse ${machines.length} coffee machines with specs, honest strengths and watch-outs, and head-to-head comparisons.`,
    canonical: '/machines/', body,
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: machines.map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: BASE + m.url, name: m.name })) },
  });
}

// ---- write ----
const write = (rel, content) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
const rmrf = rel => fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });

rmrf('machines'); rmrf('compare'); rmrf('guides');
write('assets/pages.css', CSS + '\n');

const pairs = pickPairs();
const compares = pairs.map(([a, b]) => comparePage(a, b));
const compareIdx = {};
pairs.forEach(([a, b], i) => { for (const [x, y] of [[a, b], [b, a]]) (compareIdx[x.slug] = compareIdx[x.slug] || []).push({ url: compares[i].url, title: compares[i].title }); });

for (const m of machines) write(`machines${m.url.slice('/machines'.length)}index.html`, machinePage(m, compareIdx));
write('machines/index.html', directoryPage(compares));
// guides
// Guides
const guide = require('./guides/real-cost.js')({ layout, BASE, esc });
write('guides/real-cost-of-coffee/index.html', guide.html);
for (const c of compares) write(`compare/${c.slug}/index.html`, c.html);

// public machine-readable data (agents/tools); only verified fields are included
write('machines.json', JSON.stringify({
  generated: TODAY, source: BASE, logo: BASE + '/assets/logo.svg', note: 'Scores are BrewHarbor 1-5 ratings (5 best). Prices change daily and are not published here: priceTier is a rough band (1 Budget to 5 Prosumer) and the buy link shows the current price.',
  machines: machines.map(m => ({
    name: m.name, brand: m.brand, url: BASE + m.url, category: m.category, automation: m.automation, milkSystem: m.milk,
    drinks: m.drinks, coffeeTypes: m.coffeeTypes, compact: m.compact, widthInches: m.width, maxBrewTempC: m.brewTemp,
    maintenanceLevel: m.maintenance, learningCurve: m.learning, expectedLifespanYears: m.lifespan,
    annualMaintenanceCostUSD: m.annualMaint, costPerCupUSD: m.cupCost, scores: m.scores,
    priceTier: (tierOf(m) || {}).label || null, priceTierLevel: tierOf(m) ? tierOf(m).i + 1 : null, buyLinks: m.links, image: m.image ? `${BASE}/${m.image}` : null,
    summary: m.description, whoItsFor: m.sentiment,
  })),
}, null, 1) + '\n');

const urls = ['/', '/machines/', ...machines.map(m => m.url), ...compares.map(c => c.url), ...(guide ? [guide.url] : [])];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${BASE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
write('llms.txt', `# BrewHarbor

> Find your coffee machine. Skip the research. Independent coffee machine recommendations: a 7-question quiz plus specs, scores, strengths and watch-outs for ${machines.length} machines. No sponsored placements; Amazon links are affiliate links.

## Data
- [Machine data (JSON)](${BASE}/machines.json): all machines with specs, 1-5 scores and a rough price tier
- [Recommendation API](${BASE}/api/recommend): POST a quiz profile (drinks, effort, coffeeType, budget, region, priorities) and get ranked machines with reasons; GET with no parameters returns usage docs
- [All machines](${BASE}/machines/): browsable directory
- [Sitemap](${BASE}/sitemap.xml)

## Machine pages
${machines.map(m => `- [${m.name}](${BASE}${m.url}): ${m.category}${tierLabel(m) ? ', ' + tierLabel(m).toLowerCase() + ' price range' : ''}`).join('\n')}

## Comparisons
${compares.map(c => `- [${c.title}](${BASE}${c.url})`).join('\n')}${guide ? `

## Guides
- [${guide.title}](${BASE}${guide.url}): yearly cost of nine common coffee setups, with every assumption and source shown` : ''}

## Notes
- Scores are BrewHarbor's own 1-5 ratings (5 is best), the same ones used by the quiz.
- Exact prices are not published; each machine has a rough price tier, and the buy link shows today's price.
- Width and brew temperature are omitted for machines whose specs are still being verified.
`);

console.log(JSON.stringify({ machines: machines.length, comparePages: compares.length, urls: urls.length, base: BASE, withImage: machines.filter(m => m.image).length }));
