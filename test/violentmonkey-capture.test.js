import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const userscript = await readFile(new URL('../scripts/violentmonkey-fyers-capture.user.js', import.meta.url), 'utf8');

function runUserscript({
  values = { legendCaptureToken: 'test-capture-token', legendDashboardUrl: 'https://flowdesk.example' },
  payload = {
    code: 200,
    data: [[1800000000, 100, 103, 99, 102, 1200, 0, 700, 500, 200, null, null, null, [[101, 300, 100, 'unused']]]]
  }
} = {}) {
  const requests = [];
  const menuCommands = [];
  const statusElement = { style: {}, textContent: '' };
  const documentElement = { appendChild() {} };
  const storage = { ...values };
  const page = {
    fetch: async () => ({
      ok: true,
      clone: () => ({ json: async () => payload })
    })
  };
  const context = {
    URL,
    location: { href: 'https://fyers.in/web/charts/orderflow' },
    document: {
      body: null,
      documentElement,
      getElementById: () => statusElement,
      createElement: () => statusElement
    },
    unsafeWindow: page,
    GM_getValue: (key, fallback) => storage[key] || fallback,
    GM_setValue: (key, value) => { storage[key] = value; },
    prompt: () => '',
    GM_registerMenuCommand: (name, callback) => menuCommands.push({ name, callback }),
    GM_xmlhttpRequest: (request) => {
      requests.push(request);
      request.onload({ status: 200 });
    }
  };

  vm.runInNewContext(userscript, context);
  return { page, requests, menuCommands, statusElement, storage };
}

test('forwards compact 5-minute FYERS data directly to the configured hosted dashboard', async () => {
  const { page, requests, statusElement } = runUserscript();
  await page.fetch('https://fyers.in/orderflow/footprint?symbol=NSE%3ANIFTY26OCTFUT&timeframe=5');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://flowdesk.example/api/fyers-orderflow');
  assert.equal(requests[0].headers.Authorization, 'Bearer test-capture-token');
  assert.deepEqual(JSON.parse(requests[0].data), {
    symbol: 'NSE:NIFTY26OCTFUT',
    endpoint: '/orderflow/footprint',
    timeframe: '5',
    payload: {
      code: 200,
      data: [[1800000000, 100, 103, 99, 102, 1200, null, 700, 500, 200, null, null, null, [[101, 300, 100]]]]
    }
  });
  assert.match(statusElement.textContent, /1 changed capture sent/);
});

test('ignores non-5-minute footprint requests and deduplicates identical capture data', async () => {
  const { page, requests } = runUserscript();
  await page.fetch('https://fyers.in/orderflow/footprint?symbol=NSE%3ANIFTY26OCTFUT&timeframe=15');
  await page.fetch('https://fyers.in/orderflow/footprint?symbol=NSE%3ANIFTY26OCTFUT&timeframe=5');
  await new Promise((resolve) => setImmediate(resolve));
  await page.fetch('https://fyers.in/orderflow/footprint?symbol=NSE%3ANIFTY26OCTFUT&timeframe=5');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
});

test('trims unused fields from actual FYERS volume-profile rows', async () => {
  const { page, requests } = runUserscript({
    payload: { code: 200, data: [[22100, 10, 20, 30, 'unused']] }
  });
  await page.fetch('https://fyers.in/orderflow/volume-profile?symbol=NSE%3ANIFTY26OCTFUT');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].data).payload, {
    code: 200,
    data: [[22100, 10, 20, 30]]
  });
});

test('ignores unrelated FYERS fetches', async () => {
  const { page, requests } = runUserscript();
  await page.fetch('https://fyers.in/api/quotes?symbol=NSE%3ANIFTY26OCTFUT');
  assert.equal(requests.length, 0);
});

test('offers hosted URL and token setup without embedding credentials', () => {
  const { menuCommands } = runUserscript({ values: {} });
  assert.deepEqual(menuCommands.map(({ name }) => name), ['Set hosted dashboard URL', 'Set Legend capture token']);
  assert.doesNotMatch(userscript, /test-capture-token/);
});
