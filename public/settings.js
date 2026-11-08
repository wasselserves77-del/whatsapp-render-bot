const form = document.querySelector('#settings-form');
const message = document.querySelector('#settings-message');
const tokenInput = document.querySelector('#settings-token');
const apiIndicator = document.querySelector('#api-indicator');
const webhookIndicator = document.querySelector('#webhook-indicator');
let settingsToken = '';
let tokenRequired = false;

function setConnection(api, webhook, title, detail) {
  apiIndicator.classList.toggle('is-online', api);
  webhookIndicator.classList.toggle('is-online', webhook);
  document.querySelector('#api-status').textContent = api ? 'متصل' : 'غير مهيأ';
  document.querySelector('#webhook-status').textContent = webhook ? 'نشط' : 'غير مهيأ';
  document.querySelector('#connection-state').textContent = title;
  document.querySelector('#connection-detail').textContent = detail;
}

function authHeaders() {
  return settingsToken ? { 'x-settings-token': settingsToken } : {};
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    const settings = await response.json();
    tokenRequired = settings.settingsTokenRequired;
    document.querySelector('#base-url').value = settings.baseUrl || '';
    document.querySelector('#instance-name').value = settings.instanceName || '';
    document.querySelector('#allowed-numbers').value = (settings.allowedNumbers || []).join('\n');
    document.querySelector('#public-url').value = settings.publicUrl || '';
    document.querySelector('#api-key-status').textContent = settings.apiKeyConfigured
      ? 'مفتاح API جاهز من بيئة الخادم'
      : 'غير مضبوط؛ أضف EVOLUTION_API_KEY إلى بيئة خدمة البوت';
    const allowedNumbersInput = document.querySelector('#allowed-numbers');
    const allowedNumbersFromEnv = settings.allowedNumbersFromEnv;
    allowedNumbersInput.disabled = allowedNumbersFromEnv || settings.settingsTokenRequired;
    document.querySelector('#allowed-numbers-source').textContent = allowedNumbersFromEnv
      ? 'متغير ALLOWED_NUMBERS'
      : 'أضف المتغير في Render';
    document.querySelector('#allowed-numbers-hint').textContent = allowedNumbersFromEnv
      ? 'هذه الأرقام للعرض فقط وتدار من ALLOWED_NUMBERS في Render.'
      : 'اضبط ALLOWED_NUMBERS في Render، مفصولة بفواصل أو أسطر. اكتب الأرقام بصيغة دولية مع رمز الدولة.';
    if (settings.apiKeyConfigured) {
      setConnection(false, false, 'البيانات محفوظة', 'اختبر الاتصال أو أعد حفظ webhook.');
      document.querySelector('#api-status').textContent = 'إعداد محفوظ';
    }
    if (tokenRequired) tokenInput.required = true;
  } catch {
    message.textContent = 'تعذر تحميل الإعدادات من الخادم.';
  }
}

function getSettingsPayload() {
  return {
    baseUrl: document.querySelector('#base-url').value.trim(),
    instanceName: document.querySelector('#instance-name').value.trim(),
    publicUrl: document.querySelector('#public-url').value.trim(),
    allowedNumbers: document.querySelector('#allowed-numbers').value.split(/[\s,;]+/).filter(Boolean)
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  settingsToken = tokenInput.value;
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(getSettingsPayload())
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) settingsToken = '';
      throw new Error(result.error || 'تعذر حفظ الإعدادات.');
    }
    setConnection(true, true, 'متصل وجاهز', 'تم حفظ إعدادات Evolution API وتفعيل webhook للرسائل.');
    message.textContent = 'تم الحفظ وربط webhook بنجاح.';
    message.className = 'settings-message is-success';
  } catch (error) {
    message.textContent = error.message || 'تعذر الاتصال بالخادم.';
    message.className = 'settings-message is-error';
    setConnection(false, false, 'تعذر إكمال الربط', 'راجع بيانات الاتصال ثم حاول مرة أخرى.');
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#test-connection').addEventListener('click', async (event) => {
  message.textContent = '';
  settingsToken = tokenInput.value;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('/api/evolution/test', {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) settingsToken = '';
      throw new Error(result.error || 'فشل اختبار الاتصال.');
    }
    const state = result.result?.instance?.state || result.result?.state || 'متصل';
    setConnection(true, false, 'واجهة Evolution متصلة', `حالة الـ Instance: ${state}`);
    message.textContent = 'نجح الاتصال بـ Evolution API.';
    message.className = 'settings-message is-success';
  } catch (error) {
    message.textContent = error.message || 'تعذر الاتصال بالخادم.';
    message.className = 'settings-message is-error';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#request-qr').addEventListener('click', async (event) => {
  message.textContent = '';
  settingsToken = tokenInput.value;
  const button = event.currentTarget;
  const panel = document.querySelector('#qr-panel');
  const image = document.querySelector('#qr-image');
  const pairingCode = document.querySelector('#pairing-code');
  button.disabled = true;
  panel.hidden = true;
  try {
    const response = await fetch('/api/evolution/connect', {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) settingsToken = '';
      throw new Error(result.error || 'تعذر طلب رمز QR.');
    }

    if (result.connected) {
      document.querySelector('#qr-title').textContent = 'الـInstance متصل بالفعل';
      document.querySelector('#qr-detail').textContent = 'لا يحتاج إلى QR. تحقق من حالة الاتصال أو اسم الـInstance في Evolution.';
      image.hidden = true;
      pairingCode.hidden = true;
      setConnection(true, false, 'متصل بالفعل', 'يقول Evolution إن الـInstance مفتوح.');
    } else if (result.qrImage) {
      document.querySelector('#qr-title').textContent = 'امسح الرمز من واتساب';
      document.querySelector('#qr-detail').textContent = 'واتساب على الهاتف ← الأجهزة المرتبطة ← ربط جهاز.';
      image.src = result.qrImage;
      image.hidden = false;
      pairingCode.hidden = !result.pairingCode;
      pairingCode.textContent = result.pairingCode || '';
      setConnection(false, false, 'بانتظار مسح QR', 'امسح الرمز من تطبيق واتساب المرتبط بالرقم المطلوب.');
    } else {
      document.querySelector('#qr-title').textContent = 'رمز الربط';
      document.querySelector('#qr-detail').textContent = 'أدخل رمز الاقتران الظاهر في واتساب إذا لم يرسل Evolution صورة QR.';
      image.hidden = true;
      pairingCode.hidden = !result.pairingCode;
      pairingCode.textContent = result.pairingCode || '';
    }
    panel.hidden = false;
  } catch (error) {
    message.textContent = error.message || 'تعذر الاتصال بالخادم.';
    message.className = 'settings-message is-error';
  } finally {
    button.disabled = false;
  }
});

loadSettings();