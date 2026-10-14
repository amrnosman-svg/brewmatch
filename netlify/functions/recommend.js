// netlify/functions/recommend.js — GET/POST /api/recommend
// Ranks machines with the SAME scoring code as the quiz (lib/engine.js is generated from index.html).
// Data: live Airtable via AIRTABLE_TOKEN (5 min cache); falls back to the committed snapshot.

const engine = require('./lib/engine.js');

const AIRTABLE_BASE = 'appw4XP6FKpFj4BAS';
const AIRTABLE_TABLE = 'Machines';
const SITE = process.env.SITE_URL || 'https://getbrewharbor.com';

const ALLOWED = {
  drinks: ['espresso', 'latte', 'drip', 'cold', 'pod', 'specialty'],
  effort: ['none', 'minimal', 'moderate', 'hands-on'],
  coffeeType: ['any', 'beans', 'pods', 'ground'],
  maintenance: ['none', 'light', 'moderate', 'high'],
  tempImportance: ['not', 'somewhat', 'very'],
  region: ['us', 'ca', 'uk', 'eu', 'au'],
  priorities: ['quality', 'speed', 'cost', 'eco', 'variety', 'compact'],
};
const DOC = {
  endpoint: `${SITE}/api/recommend`,
  usage: 'POST JSON (or GET with query params; lists comma-separated). Returns machines ranked exactly as the BrewHarbor quiz would.',
  fields: {
    drinks: `required, one or more of: ${ALLOWED.drinks.join(', ')}`,
    effort: `required, one of: ${ALLOWED.effort.join(', ')}`,
    coffeeType: `required, one of: ${ALLOWED.coffeeType.join(', ')}`,
    maintenance: `optional (default moderate), one of: ${ALLOWED.maintenance.join(', ')}`,
    tempImportance: `optional (default somewhat), one of: ${ALLOWED.tempImportance.join(', ')}`,
    cups: 'optional, cups per day, 1-12 (default 2)',
    budget: 'optional, number in the region currency, 20-10000 (default 1000)',
    region: `optional (default us), one of: ${ALLOWED.region.join(', ')}`,
    priorities: `optional, up to 3 in order of importance, from: ${ALLOWED.priorities.join(', ')}`,
    limit: 'optional, results to return, 1-10 (default 5)',
  },
  example: { drinks: ['latte'], effort: 'minimal', coffeeType: 'beans', budget: 800, region: 'us', priorities: ['quality', 'speed'], limit: 3 },
  data: `${SITE}/machines.json`,
};

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (statusCode, body, extra = {}) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra }, body: JSON.stringify(body, null, 1) });
const slugify = s => String(s).toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let cache = { at: 0, records: null, source: null };
async function loadRecords() {
  if (cache.records && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  const token = process.env.AIRTABLE_TOKEN;
  if (token) {
    try {
      const records = []; let offset = null;
      do {
        const params = new URLSearchParams({ pageSize: '100' }); if (offset) params.set('offset', offset);
        const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('airtable ' + res.status);
        const data = await res.json(); records.push(...data.records); offset = data.offset || null;
      } while (offset);
      cache = { at: Date.now(), records, source: 'airtable-live' };
      return cache;
    } catch (e) { /* fall through to snapshot */ }
  }
  const records = require('../../data/machines.raw.json');
  cache = { at: Date.now(), records, source: 'snapshot' };
  return cache;
}

function list(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : String(v).split(',').map(s => s.trim()).filter(Boolean)); }
function parseInput(event) {
  let raw = {};
  if (event.httpMethod === 'POST') { try { raw = JSON.parse(event.body || '{}'); } catch (e) { return { error: 'Body must be valid JSON.' }; } }
  else raw = { ...(event.queryStringParameters || {}) };
  const errors = [];
  const pick = (key, allowed, required) => {
    const v = raw[key]; if (v == null || v === '') { if (required) errors.push(`${key} is required`); return null; }
    if (!allowed.includes(String(v))) { errors.push(`${key} must be one of: ${allowed.join(', ')}`); return null; } return String(v);
  };
  const drinks = list(raw.drinks).map(d => d === 'capsule' ? 'pod' : d);
  if (!drinks.length) errors.push('drinks is required (one or more of: ' + ALLOWED.drinks.join(', ') + ')');
  else if (drinks.some(d => !ALLOWED.drinks.includes(d))) errors.push('drinks must be from: ' + ALLOWED.drinks.join(', '));
  const effort = pick('effort', ALLOWED.effort, true);
  const coffeeType = pick('coffeeType', ALLOWED.coffeeType, true);
  const maintenance = pick('maintenance', ALLOWED.maintenance, false) || 'moderate';
  const tempImportance = pick('tempImportance', ALLOWED.tempImportance, false) || 'somewhat';
  const region = pick('region', ALLOWED.region, false) || 'us';
  const priorities = list(raw.priorities).slice(0, 3);
  if (priorities.some(p => !ALLOWED.priorities.includes(p))) errors.push('priorities must be from: ' + ALLOWED.priorities.join(', '));
  const numIn = (k, lo, hi, dflt) => { if (raw[k] == null || raw[k] === '') return dflt; const n = Number(raw[k]); if (!Number.isFinite(n) || n < lo || n > hi) { errors.push(`${k} must be a number between ${lo} and ${hi}`); return dflt; } return n; };
  const budget = numIn('budget', 20, 10000, 1000), cups = numIn('cups', 1, 12, 2), limit = Math.round(numIn('limit', 1, 10, 5));
  if (errors.length) return { error: errors };
  return { answers: { drinks: [...new Set(drinks)], effort, coffeeType, maintenance, tempImportance, cups, budget, region, priorities }, limit };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Use GET or POST.' });
  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && !Object.keys(qs).length) return json(200, DOC, { 'Cache-Control': 'public, max-age=3600' });

  const parsed = parseInput(event);
  if (parsed.error) return json(400, { error: parsed.error, usage: DOC });
  const { answers, limit } = parsed;

  try {
    const { records, source } = await loadRecords();
    const machines = records.filter(r => r.fields['active'] !== false && r.fields['Active'] !== false).map(engine.mapAirtableRecord);
    engine.applyExtras(machines); // same post-load step the quiz runs
    engine.setAnswers({ ...answers });
    const ranked = engine.rank(machines);
    const sym = { us: '$', ca: 'CA$', uk: '£', eu: '€', au: 'A$' }[answers.region];
    const results = ranked.slice(0, limit).map((x, i) => {
      const m = x.m, link = m.affiliateBase && m.affiliateBase[answers.region];
      const price = engine.getPrice(m);
      return {
        rank: i + 1, name: m.name, brand: m.brand, category: m.category, score: x.result.score,
        price: price === Infinity ? null : price, currency: sym,
        estimatedAnnualCost: engine.calcTCO(m).fullAnnualTCO,
        why: x.result.reasons, tradeoffs: x.result.misses,
        page: `${SITE}/machines/${slugify(m.name)}/`,
        buyLink: link && link !== '#' ? link : null,
      };
    });
    return json(200, {
      matched: ranked.length, returned: results.length, dataSource: source, query: answers, results,
      notes: 'Scores are 0-99 relative match scores from the BrewHarbor quiz engine. Prices are estimates; buy links are Amazon affiliate links.',
    }, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    return json(500, { error: 'Recommendation failed: ' + e.message });
  }
};
