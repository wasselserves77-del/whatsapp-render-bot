const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { handleSessionMessage } = require('./lib/bot-session');
const { getEvolutionApiKey, hasAllowedNumbersEnv, parseAllowedNumbers, resolveAllowedNumbers } = require('./lib/environment');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const MAX_BODY_BYTES = 64 * 1024;
const processedMessages = new Map();
const senderSessions = new Map();

function emptySettings() {
  return {
    baseUrl: '',
    instanceName: '',
    allowedNumbers: [],
    publicUrl: '',
    webhookToken: crypto.randomBytes(24).toString('hex')
  };
}

async function loadSettings() {
  try {
    const stored = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
    const persisted = { ...stored };
    const hasLegacySecrets = Object.prototype.hasOwnProperty.call(persisted, 'apiKey');
    const hasEnvironmentAllowlist = hasAllowedNumbersEnv();
    delete persisted.apiKey;
    if (hasEnvironmentAllowlist) delete persisted.allowedNumbers;

    if (hasLegacySecrets || (hasEnvironmentAllowlist && Object.prototype.hasOwnProperty.call(stored, 'allowedNumbers'))) {
      try {
        await fs.writeFile(SETTINGS_FILE, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
      } catch (error) {
        console.error('Could not sanitize persisted settings:', error.message);
      }
    }

    return {
      ...emptySettings(),
      ...persisted,
      allowedNumbers: resolveAllowedNumbers(persisted)
    };
  } catch {
    const initial = emptySettings();
    initial.allowedNumbers = resolveAllowedNumbers(initial);
    return initial;
  }
}

let settingsPromise = loadSettings();

async function getSettings() {
  return settingsPromise;
}

async function saveSettings(nextSettings) {
  const persisted = { ...nextSettings };
  delete persisted.apiKey;
  if (hasAllowedNumbersEnv()) delete persisted.allowedNumbers;

  const runtimeSettings = {
    ...nextSettings,
    allowedNumbers: resolveAllowedNumbers(persisted)
  };
  settingsPromise = Promise.resolve(runtimeSettings);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${SETTINGS_FILE}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryFile, SETTINGS_FILE);
}

function jsonResponse(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new Error('حجم الطلب أكبر من المسموح.');
    }
  }
  return JSON.parse(body || '{}');
}

function settingsProtection(request) {
  const expected = process.env.SETTINGS_TOKEN;
  const production = process.env.NODE_ENV === 'production';
  if (!expected && production) return { allowed: false, status: 503, error: 'اضبط SETTINGS_TOKEN في إعدادات الخادم أولًا.' };
  if (!expected) return { allowed: true };

  const supplied = request.headers['x-settings-token'] || '';
  const suppliedBuffer = Buffer.from(String(supplied));
  const expectedBuffer = Buffer.from(expected);
  const matches = suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  return matches
    ? { allowed: true }
    : { allowed: false, status: 401, error: 'رمز إعدادات الموقع غير صحيح.' };
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function validateSettings(input, current) {
  let baseUrl;
  try {
    baseUrl = new URL(String(input.baseUrl || '').trim());
  } catch {
    throw new Error('أدخل عنوان Evolution API صالحًا.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new Error('يجب أن يبدأ عنوان Evolution API بـ http أو https، دون بيانات دخول في الرابط.');
  }

  const instanceName = String(input.instanceName || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(instanceName)) {
    throw new Error('اسم الـ Instance يقبل الأحرف والأرقام والنقطة والشرطة فقط.');
  }

  const apiKey = getEvolutionApiKey();
  if (!apiKey) throw new Error('اضبط EVOLUTION_API_KEY في متغيرات بيئة خدمة البوت أولًا.');

  if (process.env.NODE_ENV === 'production' && !hasAllowedNumbersEnv()) {
    throw new Error('اضبط ALLOWED_NUMBERS في متغيرات بيئة خدمة البوت أولًا.');
  }
  const rawNumbers = hasAllowedNumbersEnv()
    ? parseAllowedNumbers(process.env.ALLOWED_NUMBERS)
    : Array.isArray(input.allowedNumbers) ? input.allowedNumbers : [];
  const allowedNumbers = [...new Set(rawNumbers.map(normalizePhone).filter(Boolean))];
  if (allowedNumbers.some((number) => number.length < 7 || number.length > 15)) {
    throw new Error('استخدم أرقام واتساب بصيغة دولية، من 7 إلى 15 رقمًا.');
  }

  const publicUrl = String(input.publicUrl || '').trim().replace(/\/+$/, '');
  if (publicUrl) {
    let parsedPublicUrl;
    try {
      parsedPublicUrl = new URL(publicUrl);
    } catch {
      throw new Error('أدخل عنوان الموقع العام بصيغة صحيحة.');
    }
    if (!['http:', 'https:'].includes(parsedPublicUrl.protocol)) {
      throw new Error('يجب أن يبدأ عنوان الموقع العام بـ http أو https.');
    }
  }

  return {
    ...current,
    baseUrl: baseUrl.toString().replace(/\/+$/, ''),
    instanceName,
    allowedNumbers,
    publicUrl
  };
}

function resolvePublicUrl(request, current) {
  const configured = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || current.publicUrl;
  if (configured) return configured.replace(/\/+$/, '');
  const protocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

async function evolutionRequest(current, pathname, options = {}) {
  const response = await fetch(`${current.baseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: getEvolutionApiKey(),
      'content-type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Evolution API أعاد الحالة ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
  }
  return body ? JSON.parse(body) : {};
}

async function configureWebhook(current, publicUrl) {
  const webhookUrl = `${publicUrl}/webhook/evolution/${current.webhookToken}`;
  return evolutionRequest(current, `/webhook/set/${encodeURIComponent(current.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT']
      }
    })
  });
}

function extractText(message) {
  let current = message;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.conversation) return current.conversation;
    if (current.extendedTextMessage?.text) return current.extendedTextMessage.text;
    for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2']) {
      if (current[key]?.message) {
        current = current[key].message;
        break;
      }
    }
    if (current === message) break;
  }
  return current?.imageMessage?.caption || current?.documentMessage?.caption || '';
}

function normalizeEvent(event) {
  return String(event || '').toLowerCase().replace(/_/g, '.');
}

function pruneProcessedMessages() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, timestamp] of processedMessages) {
    if (timestamp < cutoff) processedMessages.delete(id);
  }
  while (processedMessages.size > 5000) {
    processedMessages.delete(processedMessages.keys().next().value);
  }
}

async function handleWebhook(request, response, token) {
  const current = await getSettings();
  if (!token || token !== current.webhookToken) return jsonResponse(response, 404, { ok: false });

  let payload;
  try {
    payload = await readJson(request);
  } catch {
    return jsonResponse(response, 400, { ok: false, error: 'طلب غير صالح.' });
  }

  const data = payload.data || {};
  const messageKey = data.key || {};
  const senderJid = String(messageKey.remoteJidAlt || messageKey.remoteJid || '');
  const sender = normalizePhone(senderJid.split('@')[0].split(':')[0]);
  const messageId = messageKey.id;
  if (normalizeEvent(payload.event) !== 'messages.upsert' || messageKey.fromMe || senderJid.includes('@g.us')) {
    return jsonResponse(response, 200, { ok: true, ignored: true });
  }
  if (!current.allowedNumbers.includes(sender) || !getEvolutionApiKey() || !current.baseUrl || !messageId) {
    return jsonResponse(response, 200, { ok: true, ignored: true });
  }

  pruneProcessedMessages();
  if (processedMessages.has(messageId)) return jsonResponse(response, 200, { ok: true, duplicate: true });

  processedMessages.set(messageId, Date.now());
  const result = handleSessionMessage(senderSessions, sender, extractText(data.message));
  if (!result.reply) {
    return jsonResponse(response, 200, {
      ok: true,
      action: result.action,
      stored: result.stored || 0
    });
  }

  try {
    await evolutionRequest(current, `/message/sendText/${encodeURIComponent(current.instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({
        number: sender,
        text: result.reply
      })
    });
    return jsonResponse(response, 200, { ok: true, action: result.action, total: result.total });
  } catch (error) {
    console.error('WhatsApp reply failed:', error.message);
    return jsonResponse(response, 502, { ok: false, error: 'تعذر إرسال النتيجة عبر واتساب.' });
  }
}

function contentType(filePath) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  })[path.extname(filePath)] || 'application/octet-stream';
}

async function serveStatic(request, response, pathname) {
  const routes = { '/': 'index.html', '/settings': 'settings.html' };
  const requestedPath = routes[pathname] || pathname;
  const filePath = path.resolve(PUBLIC_DIR, requestedPath.replace(/^\/+/, ''));
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      'content-type': contentType(filePath),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse(response, 200, { ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/sum') {
      const input = await readJson(request);
      if (!Array.isArray(input.values)) throw new Error('أرسل قائمة الأرقام المراد جمعها.');
      return jsonResponse(response, 200, { total: sumDecimals(input.values) });
    }

    if (request.method === 'GET' && url.pathname === '/api/settings') {
      const current = await getSettings();
      return jsonResponse(response, 200, {
        baseUrl: current.baseUrl,
        instanceName: current.instanceName,
        allowedNumbers: current.allowedNumbers,
        allowedNumbersFromEnv: hasAllowedNumbersEnv(),
        publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || current.publicUrl,
        apiKeyConfigured: Boolean(getEvolutionApiKey()),
        settingsTokenRequired: Boolean(process.env.SETTINGS_TOKEN) || process.env.NODE_ENV === 'production'
      });
    }

    if (request.method === 'PUT' && url.pathname === '/api/settings') {
      const protection = settingsProtection(request);
      if (!protection.allowed) return jsonResponse(response, protection.status, { error: protection.error });

      const input = await readJson(request);
      const current = await getSettings();
      const next = validateSettings(input, current);
      if (!next.publicUrl) next.publicUrl = resolvePublicUrl(request, current);
      await saveSettings(next);

      try {
        await configureWebhook(next, next.publicUrl);
        return jsonResponse(response, 200, { ok: true, webhookConfigured: true });
      } catch (error) {
        console.error('Evolution webhook setup failed:', error.message);
        return jsonResponse(response, 502, {
          ok: false,
          saved: true,
          error: 'حُفظت الإعدادات، لكن تعذر إعداد webhook. تحقق من بيانات Evolution API وحاول مجددًا.'
        });
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/evolution/test') {
      const protection = settingsProtection(request);
      if (!protection.allowed) return jsonResponse(response, protection.status, { error: protection.error });
      const current = await getSettings();
      if (!current.baseUrl || !current.instanceName || !getEvolutionApiKey()) {
        return jsonResponse(response, 400, { error: 'احفظ بيانات الربط أولًا.' });
      }
      const result = await evolutionRequest(current, `/instance/connectionState/${encodeURIComponent(current.instanceName)}`);
      return jsonResponse(response, 200, { ok: true, result });
    }

    if (request.method === 'POST' && url.pathname === '/api/evolution/connect') {
      const protection = settingsProtection(request);
      if (!protection.allowed) return jsonResponse(response, protection.status, { error: protection.error });
      const current = await getSettings();
      if (!current.baseUrl || !current.instanceName || !getEvolutionApiKey()) {
        return jsonResponse(response, 400, { error: 'احفظ بيانات الربط أولًا.' });
      }

      const result = await evolutionRequest(current, `/instance/connect/${encodeURIComponent(current.instanceName)}`);
      const qrSources = [result, result.qrcode, result.qr, result.data].filter(Boolean);
      const base64 = qrSources.find((source) => typeof source.base64 === 'string')?.base64;
      const code = qrSources.find((source) => typeof source.code === 'string')?.code;
      const state = String(result.instance?.state || result.state || '').toLowerCase();
      if (!base64 && ['open', 'connected'].includes(state)) {
        return jsonResponse(response, 200, { ok: true, connected: true, state });
      }
      if (!base64 && !code) {
        return jsonResponse(response, 502, {
          error: 'لم يُرجع Evolution رمز QR. اختبر حالة الـInstance وتأكد أنها غير متصلة.'
        });
      }

      const qrImage = base64
        ? (base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`)
        : '';
      return jsonResponse(response, 200, { ok: true, qrImage, pairingCode: code || '' });
    }

    const webhookMatch = url.pathname.match(/^\/webhook\/evolution\/([a-f0-9]+)$/);
    if (request.method === 'POST' && webhookMatch) {
      return await handleWebhook(request, response, webhookMatch[1]);
    }

    if (request.method === 'GET') return await serveStatic(request, response, url.pathname);
    return jsonResponse(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 400;
    return jsonResponse(response, status, { error: error.message || 'طلب غير صالح.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WhatsApp sum bot listening on port ${PORT}`);
});