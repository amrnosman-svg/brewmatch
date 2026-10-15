/* BrewHarbor cookie consent.
   Analytics (Google Analytics 4 + Microsoft Clarity) stay OFF until the visitor accepts.
   The choice is remembered in localStorage for 12 months. A Global Privacy Control signal is honoured (treated as "no").
   The footer link "Cookie settings" calls bhConsent.open() so people can change their mind. */
(function () {
  var KEY = 'bh_consent';
  var GA_ID = 'G-FTR1QNM943';
  var CLARITY_ID = 'wrrygaet15';
  var MAX_AGE = 365 * 24 * 3600 * 1000;
  var loaded = false, bannerEl = null, styled = false;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && (v.s === 'granted' || v.s === 'denied') && Date.now() - v.t < MAX_AGE) return v.s;
    } catch (e) {}
    return null;
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ s: state, t: Date.now() })); } catch (e) {}
  }

  function loadTrackers() {
    if (loaded) return;
    loaded = true;
    window['ga-disable-' + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(g);
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function clearCookies() {
    var host = location.hostname, parts = host.split('.');
    var domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); }).forEach(function (n) {
      if (!/^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM|SRM_B)/.test(n)) return;
      domains.forEach(function (d) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }
  function stopTrackers() {
    window['ga-disable-' + GA_ID] = true;
    try { if (window.clarity) window.clarity('consent', false); } catch (e) {}
    clearCookies();
  }

  function addStyles() {
    if (styled) return;
    styled = true;
    var st = document.createElement('style');
    st.textContent =
      '.bh-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:520px;margin:0 auto;box-sizing:border-box;padding:18px 20px;background:#fff;color:#2C2416;border:1px solid #E4DDD0;border-radius:16px;box-shadow:0 8px 28px rgba(44,36,22,.16);font-family:"Outfit",system-ui,sans-serif;font-size:14px;line-height:1.55}' +
      '.bh-consent p{margin:0 0 14px}' +
      '.bh-consent a{color:#2C2416;text-underline-offset:3px}' +
      '.bh-consent-row{display:flex;gap:10px;flex-wrap:wrap}' +
      '.bh-consent button{flex:1 1 140px;min-height:46px;padding:0 18px;border-radius:12px;font-family:inherit;font-size:15px;font-weight:500;cursor:pointer}' +
      '.bh-yes{background:#b04a26;color:#fff;border:1.5px solid #b04a26}.bh-yes:hover{background:#8f3b1c;border-color:#8f3b1c}' +
      '.bh-no{background:transparent;color:#2C2416;border:1.5px solid #2C2416}.bh-no:hover{background:#2C2416;color:#fff}' +
      '.bh-consent button:focus-visible,.bh-consent a:focus-visible{outline:3px solid #b04a26;outline-offset:2px}';
    document.head.appendChild(st);
  }

  function close() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }
  function decide(state) {
    write(state);
    if (state === 'granted') loadTrackers(); else stopTrackers();
    close();
  }
  function open() {
    if (bannerEl) return;
    addStyles();
    bannerEl = document.createElement('div');
    bannerEl.className = 'bh-consent';
    bannerEl.setAttribute('role', 'dialog');
    bannerEl.setAttribute('aria-label', 'Cookie choices');
    bannerEl.innerHTML =
      '<p>Can we use analytics cookies? They show us which pages and questions work so we can improve BrewHarbor. They stay off unless you say yes. No ads, and nothing is sold. <a href="/privacy">Privacy details</a></p>' +
      '<div class="bh-consent-row"><button type="button" class="bh-yes">Yes, that\u2019s fine</button><button type="button" class="bh-no">No thanks</button></div>';
    bannerEl.querySelector('.bh-yes').addEventListener('click', function () { decide('granted'); });
    bannerEl.querySelector('.bh-no').addEventListener('click', function () { decide('denied'); });
    document.body.appendChild(bannerEl);
  }

  function init() {
    // Global Privacy Control = a standing "no": keep everything off and don't ask.
    if (navigator.globalPrivacyControl === true) return;
    var saved = read();
    if (saved === 'granted') loadTrackers();
    else if (saved === null) open();
  }

  window.bhConsent = { open: open, status: read };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
