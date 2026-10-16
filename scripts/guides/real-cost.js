// Guide: "What your coffee habit really costs per year".
// Every number in the page is computed here from the inputs below, so text, table, chart and calculator cannot disagree.
// Inputs were checked in October 2026 (see SOURCES). Machine cost, lifespan and upkeep are illustrative round numbers,
// not product prices.
module.exports = function buildRealCost({ layout, BASE, esc }) {
  const LB = 453.6, DRINKS = 2, DAYS = 365;
  const BLS_LB = 9.317;                 // BLS average, ground roast coffee, July 2026
  const SPEC_LOW_LB = 23.73, SPEC_AVG_LB = 32.75; // specialty roasters tracked, Q1 2026 (lowest-priced / average)
  const perG = lb => lb / LB;
  const drink = { groceryEsp: perG(BLS_LB) * 18, groceryFilter: perG(BLS_LB) * 15,
    specEspLow: perG(SPEC_LOW_LB) * 18, specEspAvg: perG(SPEC_AVG_LB) * 18,
    specFilterLow: perG(SPEC_LOW_LB) * 15, specFilterAvg: perG(SPEC_AVG_LB) * 15 };

  const S = [
    { id: 'vertuo',   label: 'Nespresso Vertuo pods',               machine: 150, life: 6,  upkeep: 20, per: 1.20, range: [1.00, 1.50], note: 'Vertuo pods' },
    { id: 'orig',     label: 'Nespresso Original, official pods',   machine: 150, life: 7,  upkeep: 20, per: 0.90, range: [0.70, 1.10], note: 'Original pods from Nespresso' },
    { id: 'origc',    label: 'Nespresso Original, compatible pods', machine: 150, life: 7,  upkeep: 20, per: 0.50, range: [0.35, 0.65], note: 'Third-party Original-line pods' },
    { id: 'kcup',     label: 'Keurig K-Cups',                       machine: 100, life: 5,  upkeep: 20, per: 0.55, range: [0.40, 0.90], note: 'K-Cups (lowest-confidence input)' },
    { id: 'supg',     label: 'Super-automatic, grocery-store beans',machine: 700, life: 8,  upkeep: 70, per: drink.groceryEsp, range: null, note: '18 g per double shot' },
    { id: 'sups',     label: 'Super-automatic, specialty beans',    machine: 700, life: 8,  upkeep: 70, per: drink.specEspAvg, range: [drink.specEspLow, drink.specEspAvg], note: '18 g per double shot' },
    { id: 'dripg',    label: 'Drip machine, grocery-store coffee',  machine: 150, life: 8,  upkeep: 20, per: drink.groceryFilter, range: null, note: '15 g per 8 oz cup' },
    { id: 'drips',    label: 'Drip machine, specialty beans',       machine: 150, life: 8,  upkeep: 20, per: drink.specFilterAvg, range: [drink.specFilterLow, drink.specFilterAvg], note: '15 g per 8 oz cup' },
    { id: 'manual',   label: 'Pour-over or French press, grocery-store coffee', machine: 40, life: 10, upkeep: 0, per: drink.groceryFilter, range: null, note: '15 g per 8 oz cup' },
  ];
  const yearly = (s, drinks) => { const fixed = s.machine / s.life + s.upkeep; const coffee = s.per * drinks * DAYS; return { fixed, coffee, total: fixed + coffee }; };
  const r5 = n => Math.round(n / 5) * 5;
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');
  const usd5 = n => '$' + r5(n).toLocaleString('en-US');
  const c2 = n => '$' + n.toFixed(2);
  const by = Object.fromEntries(S.map(s => [s.id, { ...s, y: yearly(s, DRINKS) }]));
  const rows = S.map(s => ({ ...s, y: yearly(s, DRINKS) })).sort((a, b) => b.y.total - a.y.total);
  const maxT = Math.max(...rows.map(r => r.y.total));
  const vs = by.vertuo.y.total, sg = by.supg.y.total, ss = by.sups.y.total;
  const saving = vs - sg, upfront = by.supg.machine - by.vertuo.machine, payback = upfront / saving * 12;
  const coffeeShare = id => Math.round(100 * by[id].y.coffee / by[id].y.total);
  const podShares = ['vertuo', 'orig', 'origc', 'kcup'].map(coffeeShare);

  const title = 'What your coffee habit really costs per year (2026)';
  const desc = 'Yearly cost of nine common coffee setups at two drinks a day: pods, K-Cups, super-automatics, drip and pour-over, with every assumption and source shown.';
  const url = '/guides/real-cost-of-coffee/';
  const model = S.map(s => ({ id: s.id, label: s.label, fixed: +(s.machine / s.life + s.upkeep).toFixed(2), per: +s.per.toFixed(3) }));

  const css = `<style>
.rc-box{background:var(--off-white);border:1px solid var(--light-grey);border-radius:14px;padding:18px 20px;margin:22px 0}
.rc-box ul{margin:0;padding-left:20px}.rc-box li{margin:8px 0}
.rc-bars{display:grid;gap:14px;margin:18px 0 8px}
.rc-row{display:grid;grid-template-columns:1fr;gap:6px}
.rc-lab{display:flex;justify-content:space-between;gap:12px;font-size:14px}.rc-lab b{font-weight:500;white-space:nowrap}
.rc-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--light-grey)}
.rc-m{background:var(--mid-grey)}.rc-c{background:#b04a26}
.rc-key{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--mid-grey);margin:6px 0 0}
.rc-key i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.rc-calc{border:1px solid var(--light-grey);border-radius:14px;padding:18px 20px;margin:18px 0;display:grid;gap:14px}
.rc-calc label{display:grid;gap:6px;font-size:14px}
.rc-calc select{font:inherit;padding:11px 12px;border-radius:10px;border:1.5px solid var(--light-grey);background:var(--white);color:var(--black)}
.rc-calc input[type=range]{width:100%}
.rc-out{font-size:15px;line-height:1.6}.rc-out strong{font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:600;display:block;line-height:1.1}
.rc-cta{display:inline-block;background:#b04a26;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:500;margin-top:8px}
.rc-small{font-size:13px;color:var(--mid-grey)}
.rc td:first-child,.rc th:first-child{width:auto}.rc table th{width:auto}
@media(min-width:640px){.rc-row{grid-template-columns:260px 1fr;align-items:center}}
</style>`;

  const bars = rows.map(r => `<div class="rc-row"><div class="rc-lab"><span>${esc(r.label)}</span><b>${usd5(r.y.total)}</b></div><div class="rc-bar" role="img" aria-label="${esc(r.label)}: machine and upkeep ${usd5(r.y.fixed)}, coffee ${usd5(r.y.coffee)}, total ${usd5(r.y.total)} a year"><span class="rc-m" style="width:${(100 * r.y.fixed / maxT).toFixed(1)}%"></span><span class="rc-c" style="width:${(100 * r.y.coffee / maxT).toFixed(1)}%"></span></div></div>`).join('\n');
  const table = rows.map(r => `<tr><td>${esc(r.label)}</td><td>${usd5(r.y.fixed)}</td><td>${usd5(r.y.coffee)}</td><td><strong>${usd5(r.y.total)}</strong></td><td>${Math.round(100 * r.y.coffee / r.y.total)}%</td></tr>`).join('\n');
  const rng = a => a ? `${c2(a[0])} to ${c2(a[1])}` : '';
  const perRows = [
    ['Grocery-store ground or beans', `${c2(drink.groceryFilter)} filter, ${c2(drink.groceryEsp)} espresso`, 'US average $9.32/lb (BLS, July 2026), 15 g per cup or 18 g per double shot'],
    ['Specialty beans', `${c2(drink.specFilterLow)} to ${c2(drink.specFilterAvg)} filter, ${c2(drink.specEspLow)} to ${c2(drink.specEspAvg)} espresso`, '$23.73 to $32.75/lb: lowest-priced to average among specialty roasters tracked, Q1 2026'],
    ['Nespresso Original, official pods', `${rng(by.orig.range)} (we use ${c2(by.orig.per)})`, 'Typical 2026 retail range'],
    ['Nespresso Original, compatible pods', `${rng(by.origc.range)} (we use ${c2(by.origc.per)})`, 'Third-party pods that fit Original machines'],
    ['Nespresso Vertuo pods', `${rng(by.vertuo.range)} (we use ${c2(by.vertuo.per)})`, 'Vertuo machines only take Nespresso pods'],
    ['Keurig K-Cups', `${rng(by.kcup.range)} (we use ${c2(by.kcup.per)})`, 'Widest spread and the weakest source of the five'],
  ].map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('\n');
  const assump = S.map(s => `<tr><td>${esc(s.label)}</td><td>${usd(s.machine)}</td><td>${s.life} yrs</td><td>${usd(s.upkeep)}</td><td>${c2(s.per)}</td></tr>`).join('\n');
  const opts = S.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');

  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, url: BASE + url,
    mainEntityOfPage: BASE + url, datePublished: '2026-10-15', dateModified: '2026-10-15',
    author: { '@type': 'Organization', name: 'BrewHarbor' }, publisher: { '@type': 'Organization', name: 'BrewHarbor', logo: { '@type': 'ImageObject', url: BASE + '/assets/logo.svg' } } };

  const body = `${css}
<div class="crumbs rc"><a href="/">BrewHarbor</a> › Guides › Real cost of coffee</div>
<div class="rc">
<h1>What your coffee habit really costs per year</h1>
<p class="lede">We worked out what nine common coffee setups cost per year, assuming two drinks a day. For most of them the machine is the smaller part of the bill. What you put in it costs more.</p>

<div class="rc-box"><strong>Quick takeaways</strong><ul>
<li>If you use pods, the pods are almost the whole cost: ${Math.min(...podShares)}% to ${Math.max(...podShares)}% of the yearly total in the pod setups below.</li>
<li>The same super-automatic costs about ${usd5(sg)} a year with grocery-store coffee and about ${usd5(ss)} with specialty beans. That is ${(ss / sg).toFixed(1)} times as much for the same machine.</li>
<li>A Nespresso Original pod (about ${c2(by.orig.per)}) costs a little less than the beans in a specialty double shot (${c2(drink.specEspLow)} to ${c2(drink.specEspAvg)}).</li>
<li>Original machines with compatible pods (${usd5(by.origc.y.total)} a year), a super-automatic with grocery beans (${usd5(sg)}) and K-Cups (${usd5(by.kcup.y.total)}) all cost about the same.</li></ul></div>

<h2>Yearly cost by setup</h2>
<p>Two drinks a day, every day. Each bar splits the yearly cost into the machine (spread over its life, plus upkeep) and the coffee or pods. The key is below the chart.</p>
<div class="rc-bars">
${bars}
</div>
<div class="rc-key"><span><i style="background:var(--mid-grey)"></i>Machine and upkeep</span><span><i style="background:#b04a26"></i>Coffee or pods</span></div>
<div class="scroll"><table>
<thead><tr><th>Setup</th><th>Machine and upkeep</th><th>Coffee or pods</th><th>Total a year</th><th>Share that is coffee</th></tr></thead>
<tbody>
${table}
</tbody></table></div>
<p class="rc-small">Rounded to the nearest $5, so columns may not add exactly. Specialty rows use the average specialty price; at the lowest-priced end the super-automatic comes to about ${usd5(yearly({ ...by.sups, per: drink.specEspLow }, DRINKS).total)} and the drip machine to about ${usd5(yearly({ ...by.drips, per: drink.specFilterLow }, DRINKS).total)}.</p>

<h2>When a more expensive machine pays for itself</h2>
<p>Say you drink two Vertuo pods a day (${usd5(vs)} a year) and switch to a ${usd(by.supg.machine)}-class super-automatic running on grocery-store beans. You would spend about ${usd5(saving)} less per year, and the extra ${usd5(upfront)} up front pays for itself in about ${Math.round(payback)} months.</p>
<p>That only holds if you keep buying ordinary beans. Switch to specialty beans and the Vertuo setup (${usd5(vs)}) costs less than the super-automatic (${usd5(ss)}). What you put in the machine matters more than which machine you buy.</p>

<h2>The cost of one drink</h2>
<p>Everything above is built from these per-drink costs.</p>
<div class="scroll"><table>
<thead><tr><th>What you use</th><th>Per drink</th><th>Where it comes from</th></tr></thead>
<tbody>
${perRows}
</tbody></table></div>

<h2>Try your own numbers</h2>
<div class="rc-calc" id="rcCalc">
<label>Setup<select id="rcSetup">${opts}</select></label>
<label>Drinks per day: <output id="rcDrinksOut">2</output><input type="range" id="rcDrinks" min="1" max="6" value="2"></label>
<div class="rc-out" aria-live="polite"><strong id="rcTotal"></strong><span id="rcDetail"></span></div>
</div>
<p class="rc-small">Fewer drinks shrink the gap between setups. More drinks widen it.</p>

<h2>What these numbers leave out</h2>
<ul>
<li>Milk, syrups and sugar.</li>
<li>Paper filters for drip and pour-over, and a grinder or kettle if you start with whole beans.</li>
<li>Electricity, shipping, tax and sales.</li>
<li>Machines that die early, or last longer than we assumed.</li>
</ul>
<p>These are estimates, not quotes. Coffee got a lot more expensive in 2025 and 2026, so plug in what you actually pay.</p>

<h2>Assumptions</h2>
<p>Machine cost, lifespan and upkeep (descaler, cleaning tablets, water filters) are round numbers for each kind of setup, not the price of any particular product. Reviews of super-automatics put their lifespan anywhere from 5 to 10 years, so we used 8.</p>
<div class="scroll"><table>
<thead><tr><th>Setup</th><th>Machine</th><th>Life</th><th>Upkeep a year</th><th>Per drink</th></tr></thead>
<tbody>
${assump}
</tbody></table></div>
<p class="rc-small">Yearly cost = machine ÷ life + upkeep + per-drink cost × drinks a day × 365.</p>

<h2>Sources</h2>
<ul class="rc-small">
<li>US Bureau of Labor Statistics, average price of 100% ground roast coffee, US city average, $9.32/lb in July 2026: <a href="https://fred.stlouisfed.org/series/APU0000717311" rel="noopener">series APU0000717311</a>.</li>
<li>Specialty roaster prices, Q1 2026 ($23.73 lowest-priced, $32.75 average): <a href="https://dailycoffeenews.com/2026/05/15/u-s-grocery-coffee-prices-hit-all-time-average-high-in-april/" rel="noopener">Daily Coffee News</a>.</li>
<li>Dose: the Specialty Coffee Association Golden Cup standard (55 g per litre, plus or minus 10%), about 15 g for an 8 oz cup, and 18 to 20 g for a double espresso.</li>
<li>Nespresso pod price ranges, 2026: <a href="https://afpakmachine.com/nespresso-pods-cost/" rel="noopener">AFPAK</a> and <a href="https://www.driproast.com/best-nespresso-machines/" rel="noopener">Drip Roast</a>; K-Cup ranges vary by source and are the least certain.</li>
</ul>
<p class="rc-small">Checked October 2026. There are no affiliate links on this page, and nothing here is sponsored.</p>

<p><a class="rc-cta" href="/">Find a machine for your habit</a></p>
</div>
<script>
(function(){
  var M=${JSON.stringify(model)},D=365;
  var s=document.getElementById('rcSetup'),r=document.getElementById('rcDrinks'),o=document.getElementById('rcDrinksOut'),t=document.getElementById('rcTotal'),d=document.getElementById('rcDetail');
  function m(n){return '$'+(Math.round(n/5)*5).toLocaleString('en-US');}
  function go(){var x=M.filter(function(a){return a.id===s.value})[0],n=+r.value,c=x.per*n*D,tot=x.fixed+c;
    o.textContent=n;t.textContent=m(tot)+' a year';
    d.textContent=m(x.fixed)+' machine and upkeep + '+m(c)+' coffee or pods = about $'+(tot/(n*D)).toFixed(2)+' per drink all-in.';}
  s.addEventListener('change',go);r.addEventListener('input',go);go();
})();
</script>`;

  const html = layout({ title: title + ' | BrewHarbor', desc, canonical: url, body, jsonld: ld });
  return { url, html, title, summary: { rows: rows.map(r => ({ id: r.id, total: r.y.total })), saving, payback, upfront, ss, sg, vs } };
};
