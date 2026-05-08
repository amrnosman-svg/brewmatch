// netlify/functions/airtable.js
// Proxies Airtable requests server-side so the API token never reaches the browser.
// Deploy to Netlify, then set AIRTABLE_TOKEN in Site Settings → Environment Variables.

const AIRTABLE_BASE  = 'appw4XP6FKpFj4BAS';
const AIRTABLE_TABLE = 'Machines';

exports.handler = async function(event, context) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AIRTABLE_TOKEN environment variable not set' }),
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let records = [];
  let offset  = null;

  try {
    do {
      const params = new URLSearchParams({ pageSize: '100' });
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?${params}`;
      const res  = await fetch(url, { headers });

      if (!res.ok) {
        const text = await res.text();
        return {
          statusCode: res.status,
          body: JSON.stringify({ error: `Airtable error: ${res.status}`, detail: text }),
        };
      }

      const data = await res.json();
      records.push(...data.records);
      offset = data.offset || null;
    } while (offset);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 min cache — reduces Airtable API calls
      },
      body: JSON.stringify(records),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
