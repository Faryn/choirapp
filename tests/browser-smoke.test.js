const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');

const baseUrl = new URL(process.env.CHOIR_TEST_URL || 'http://127.0.0.1:5175/');
const chromiumBin = process.env.CHROMIUM_BIN || 'chromium';
let nextPort = Number(process.env.CHROME_REMOTE_PORT || 9340);

function appUrl(path) {
  return new URL(path, baseUrl).href;
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function waitForPageTarget(port) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson(port, '/json/list');
      const target = targets.find((item) => item.type === 'page');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('No Chromium page target');
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const problems = [];

  function send(method, params = {}) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      problems.push(`exception: ${message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const args = (message.params.args || []).map((arg) => arg.value || arg.description).join(' ');
      if (/pdf|score|error|refused|csp|worker|violat/i.test(args) || message.params.type === 'error') {
        problems.push(`console ${message.params.type}: ${args}`);
      }
    }
    if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      if (/pdf|score|error|refused|csp|worker|violat/i.test(entry.text)) {
        problems.push(`log ${entry.level}: ${entry.text}`);
      }
    }
    if (message.method === 'Network.loadingFailed' && message.params.type !== 'Document') {
      problems.push(`network ${message.params.type}: ${message.params.errorText}`);
    }
  };

  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  return { send, problems, close: () => ws.close() };
}

async function withPage(url, callback) {
  const port = nextPort;
  nextPort += 1;
  const chrome = spawn(chromiumBin, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/choir-browser-smoke-${port}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    const target = await waitForPageTarget(port);
    const page = await connectTarget(target);
    await page.send('Page.navigate', { url });
    await callback(page);
    const actionableProblems = page.problems.filter((item) => (
      !/favicon\\.ico/.test(item) &&
      !/network Media: net::ERR_ABORTED/.test(item)
    ));
    assert.deepEqual(actionableProblems, []);
    page.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

async function waitForEvaluation(page, expression, predicate, label, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true });
    lastValue = result.result.value;
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready: ${JSON.stringify(lastValue)}`);
}

const practiceStateExpression = `(() => {
  const canvas = document.querySelector('.score-page');
  let nonWhite = null;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let count = 0;
    let total = 0;
    for (let y = 0; y < canvas.height; y += 20) {
      for (let x = 0; x < canvas.width; x += 20) {
        const data = ctx.getImageData(x, y, 1, 1).data;
        const avg = (data[0] + data[1] + data[2]) / 3;
        if (avg < 245) count += 1;
        total += 1;
      }
    }
    nonWhite = { count, total };
  }
  return {
    songs: [...document.querySelectorAll('#songSelect option')].map((option) => option.textContent),
    songOptions: document.querySelectorAll('#songSelect option').length,
    scorePages: document.querySelectorAll('.score-page').length,
    scoreOpen: document.querySelector('#scoreOpen')?.href || '',
    scoreMessage: document.querySelector('#scorePages')?.innerText || '',
    speedValue: document.querySelector('#speedSelect')?.value || '',
    loopEnabled: Boolean(document.querySelector('#loopEnabled')?.checked),
    currentSeconds: document.querySelector('#sVal')?.textContent || '',
    trackValue: document.querySelector('#trackSelect')?.value || '',
    trackOptions: document.querySelectorAll('#trackSelect option').length,
    nonWhite,
  };
})()`;

const pageCoderStateExpression = `(() => ({
  songOptions: document.querySelectorAll('#songSelect option').length,
  trackOptions: document.querySelectorAll('#trackSelect option').length,
  scorePages: document.querySelectorAll('.score-page').length,
  scoreName: document.querySelector('#scoreName')?.textContent || '',
}))()`;

(async () => {
  await withPage(appUrl(''), async (page) => {
    const state = await waitForEvaluation(
      page,
      practiceStateExpression,
      (value) => value.songOptions > 0 && value.scorePages > 0 && value.nonWhite?.count > 0,
      'practice PDF render',
    );
    assert.equal(state.songOptions > 0, true, 'practice song list did not populate');
    assert.equal(state.scorePages > 0, true, 'practice score pages did not render');
    assert.equal(state.nonWhite.count > 0, true, 'practice score canvas appears blank');
    assert.doesNotMatch(state.scoreOpen, /%2520/, 'practice PDF URL is double encoded');

    await page.send('Runtime.evaluate', { expression: `
      document.querySelector('#speedSelect').value = '0.85';
      document.querySelector('#speedSelect').dispatchEvent(new Event('change'));
      document.querySelector('#loopEnabled').checked = false;
      document.querySelector('#loopEnabled').dispatchEvent(new Event('change'));
    ` });
    await page.send('Page.reload', { ignoreCache: true });
    const restored = await waitForEvaluation(
      page,
      practiceStateExpression,
      (value) => value.songOptions > 0 && value.speedValue === '0.85' && value.loopEnabled === false,
      'practice settings restore',
    );
    assert.equal(restored.speedValue, '0.85');
    assert.equal(restored.loopEnabled, false);

    const switched = await page.send('Runtime.evaluate', { expression: `(() => {
      const before = document.querySelector('#sVal')?.textContent || '';
      const select = document.querySelector('#trackSelect');
      if (!select || select.options.length < 2) return { skipped: true, before };
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      return { skipped: false, before, selected: select.value };
    })()`, returnByValue: true });
	    if (!switched.result.value.skipped) {
	      const afterSwitch = await waitForEvaluation(
	        page,
	        practiceStateExpression,
	        (value) => value.trackValue === switched.result.value.selected,
	        'paused track switch',
	      );
	      assert.equal(afterSwitch.currentSeconds, switched.result.value.before, 'paused track switch moved the playhead');
	    }
	  });

  await withPage(appUrl('?r=aliento'), async (page) => {
    const state = await waitForEvaluation(
      page,
      practiceStateExpression,
      (value) => value.songOptions > 0 && value.scorePages > 0 && value.nonWhite?.count > 0,
      'aliento PDF render',
      60000,
    );
    assert.deepEqual(state.songs.sort(), ['amarantine', 'incayuyo']);
    assert.equal(state.scorePages > 0, true, 'Aliento score pages did not render');
    assert.equal(state.nonWhite.count > 0, true, 'Aliento score canvas appears blank');
    assert.match(state.scoreOpen, /data\/repertoire\/02_Aliento\//);
    assert.doesNotMatch(state.scoreOpen, /%2520/, 'Aliento PDF URL is double encoded');
    assert.equal(state.speedValue, '1', 'default repertoire tempo leaked into Aliento');
    assert.equal(state.loopEnabled, true, 'default repertoire loop setting leaked into Aliento');
  });

  await withPage(appUrl('page-coder.html'), async (page) => {
    const state = await waitForEvaluation(
      page,
      pageCoderStateExpression,
      (value) => value.songOptions > 0 && value.trackOptions > 0 && value.scorePages > 0,
      'page coder PDF render',
      60000,
    );
    assert.equal(state.songOptions > 0, true, 'page coder song list did not populate');
    assert.equal(state.trackOptions > 0, true, 'page coder track list did not populate');
    assert.equal(state.scorePages > 0, true, 'page coder score page did not render');
    assert.doesNotMatch(state.scoreName, /Could not load/i);
  });

  console.log(`browser smoke ok: ${baseUrl.href}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
