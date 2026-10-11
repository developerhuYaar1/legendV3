// ==UserScript==
// @name         Legend FYERS Orderflow Capture
// @namespace    https://fyers.in/
// @version      1.1.0
// @description  Forward compact FYERS orderflow data directly to the hosted dashboard.
// @match        https://fyers.in/web/charts/orderflow*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  const targetPaths = new Set(['/orderflow/footprint', '/orderflow/volume-profile']);
  const lastForwarded = new Map();
  const inFlight = new Set();
  const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  let forwarded = 0;

  function updateStatus(message, isError = false) {
    let status = document.getElementById('legend-fyers-capture-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'legend-fyers-capture-status';
      status.style.cssText = [
        'position:fixed',
        'z-index:2147483647',
        'right:12px',
        'bottom:12px',
        'padding:8px 12px',
        'border-radius:6px',
        'background:#151922',
        'color:#dce4f2',
        'font:12px/1.4 sans-serif',
        'box-shadow:0 2px 12px #0008'
      ].join(';');
      (document.body || document.documentElement).appendChild(status);
    }
    status.textContent = `Flowdesk capture · ${message}`;
    status.style.border = `1px solid ${isError ? '#f87171' : '#5ee0a0'}`;
  }

  function configuredCaptureUrl() {
    try {
      const dashboardUrl = new URL(GM_getValue('legendDashboardUrl', ''));
      if (dashboardUrl.protocol !== 'https:' || dashboardUrl.username || dashboardUrl.password) return null;
      return new URL('/api/fyers-orderflow', dashboardUrl.origin).toString();
    } catch {
      return null;
    }
  }

  function requestInfo(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl, location.href);
    } catch {
      return null;
    }
    if (!targetPaths.has(url.pathname)) return null;
    const symbol = url.searchParams.get('symbol');
    if (!symbol || !/:(NIFTY|SENSEX)\d.*FUT$/i.test(symbol)) return null;
    const timeframe = url.searchParams.get('timeframe')
      || url.searchParams.get('resolution')
      || url.searchParams.get('interval')
      || '';
    if (url.pathname === '/orderflow/footprint' && !/^5(?:m)?$/i.test(timeframe)) return null;
    return { symbol, endpoint: url.pathname, timeframe: timeframe || undefined };
  }

  function compactPayload(info, payload) {
    if (payload?.code !== 200 || !Array.isArray(payload.data)) return null;
    if (info.endpoint === '/orderflow/footprint') {
      const data = payload.data.filter((row) => Array.isArray(row) && row.length >= 14)
        .map((row) => [
          row[0], row[1], row[2], row[3], row[4], row[5], null, row[7], row[8], row[9], null, null, null,
          Array.isArray(row[13])
            ? row[13].filter((level) => Array.isArray(level) && level.length >= 3)
              .map((level) => [level[0], level[1], level[2]])
            : []
        ]);
      return { code: 200, data };
    }

    const data = payload.data.filter((row) => Array.isArray(row) && row.length >= 4)
      .map((row) => [row[0], row[1], row[2], row[3]]);
    return { code: 200, data };
  }

  function forward(info, rawPayload) {
    const captureUrl = configuredCaptureUrl();
    const token = GM_getValue('legendCaptureToken', '');
    if (!captureUrl || !token) {
      updateStatus('set the HTTPS dashboard URL and capture token in the Violentmonkey menu', true);
      return;
    }

    const payload = compactPayload(info, rawPayload);
    if (!payload) return;
    const body = JSON.stringify({ ...info, payload });
    const key = `${info.symbol}:${info.endpoint}:${info.timeframe || ''}`;
    if (lastForwarded.get(key) === body || inFlight.has(body)) return;
    inFlight.add(body);

    GM_xmlhttpRequest({
      method: 'POST',
      url: captureUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: body,
      timeout: 10000,
      onload(response) {
        inFlight.delete(body);
        if (response.status < 200 || response.status >= 300) {
          updateStatus(`server rejected capture (${response.status})`, true);
          return;
        }
        lastForwarded.set(key, body);
        forwarded += 1;
        updateStatus(`${forwarded} changed capture${forwarded === 1 ? '' : 's'} sent`);
      },
      onerror() {
        inFlight.delete(body);
        updateStatus('could not reach the hosted dashboard', true);
      },
      ontimeout() {
        inFlight.delete(body);
        updateStatus('hosted dashboard request timed out', true);
      }
    });
  }

  const originalFetch = page.fetch;
  if (typeof originalFetch === 'function') {
    page.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      let info;
      try {
        const input = args[0];
        info = requestInfo(typeof input === 'string' ? input : input?.url);
      } catch {
        return result;
      }
      if (!info) return result;

      return result.then((response) => {
        if (response.ok) {
          response.clone().json()
            .then((payload) => forward(info, payload))
            .catch(() => updateStatus('could not read an orderflow response', true));
        }
        return response;
      });
    };
  }

  const xhrPrototype = page.XMLHttpRequest?.prototype;
  if (xhrPrototype) {
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;
    xhrPrototype.open = function (method, url, ...rest) {
      this.__legendCaptureInfo = requestInfo(url);
      return originalOpen.call(this, method, url, ...rest);
    };
    xhrPrototype.send = function (...args) {
      const info = this.__legendCaptureInfo;
      if (info) {
        this.addEventListener('load', () => {
          if (this.status < 200 || this.status >= 300) return;
          try {
            const payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
            forward(info, payload);
          } catch {
            updateStatus('could not read an orderflow response', true);
          }
        }, { once: true });
      }
      return originalSend.apply(this, args);
    };
  }

  GM_registerMenuCommand('Set hosted dashboard URL', () => {
    const value = prompt('Paste the public HTTPS URL of your Back4App app (not the Back4App dashboard URL).');
    if (!value?.trim()) return;
    try {
      const dashboardUrl = new URL(value.trim());
      if (dashboardUrl.protocol !== 'https:' || dashboardUrl.username || dashboardUrl.password) {
        throw new TypeError('HTTPS URL required');
      }
      GM_setValue('legendDashboardUrl', dashboardUrl.origin);
      updateStatus('hosted dashboard URL saved');
    } catch {
      updateStatus('enter a valid public HTTPS app URL', true);
    }
  });

  GM_registerMenuCommand('Set Legend capture token', () => {
    const value = prompt('Paste LEGEND_CAPTURE_TOKEN from your Back4App app settings. It is stored in Violentmonkey, not in this script.');
    if (!value?.trim()) return;
    GM_setValue('legendCaptureToken', value.trim());
    updateStatus('capture token saved');
  });

  updateStatus(configuredCaptureUrl() && GM_getValue('legendCaptureToken', '')
    ? 'ready; waiting for 5-minute footprint and profile data'
    : 'set the HTTPS dashboard URL and capture token in the menu', true);
})();
