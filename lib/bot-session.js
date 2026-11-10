const { sumDecimals } = require('./decimal');
const { extractPriceCandidates } = require('./price-filter');

const SUM_COMMAND = 'oslo';
const LEGACY_SUM_COMMAND = 'olso';
const CLEAR_COMMAND = 'oslo_d';
const MAX_SESSION_VALUES = 200;
const BRAND_NAME = 'mezan_ ميزان';
const BRAND_HEADER = `\u200f*${BRAND_NAME}*\u200f`;

function branded(message) {
  return `${BRAND_HEADER}\n${message}`;
}

function normalizeConfirmation(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!،,؟?]+$/g, '').trim();
  if (['اعتمد', 'اعتماد', 'نعم', 'اي', 'أيوه', 'ايوه', 'yes', 'y'].includes(normalized)) return true;
  if (['تخطي', 'تجاهل', 'استبعد', 'لا', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function confirmationPrompt(value) {
  return `${branded('⚠️ أحتاج تأكيدك')}\n\nهل أعتمد الرقم *〔 ${value} 〕* كسعر؟\nأرسل *اعتمد* لإضافته أو *تخطي* لتجاهله.`;
}

const WELCOME_MESSAGE = [
  branded('مرحبًا بك. أنا جاهز لاستقبال الأعداد.'),
  '',
  '*طريقة الاستخدام:*',
  '• أرسل الطلب؛ سأحفظ الأسعار الواضحة وأتجاهل أرقام الهواتف والكميات.',
  '• إذا التبس عليّ رقم، أرسل *اعتمد* لقبوله كسعر أو *تخطي* لتجاهله.',
  `• أرسل الأمر *${SUM_COMMAND}* لحساب المجموع بعد إدخال الأسعار.`,
  `• بعد ظهور النتيجة، أرسل *${CLEAR_COMMAND}* لمسح الجلسة والبدء من جديد.`
].join('\n');

function handleSessionMessage(sessions, sender, text) {
  const normalized = String(text || '').trim().toLowerCase();
  let session = sessions.get(sender);
  const isNewSession = !session;

  if (!session) {
    session = { values: [], pending: [] };
    sessions.set(sender, session);
  } else {
    session.pending ||= [];
    session.values ||= [];
  }

  if (normalized === CLEAR_COMMAND) {
    session.values = [];
    session.pending = [];
    return {
      action: 'cleared',
      reply: branded(`تم حذف أعداد جلستك. أرسل الأعداد الجديدة، ثم أرسل ${SUM_COMMAND} لحساب مجموعها.`)
    };
  }

  const confirmation = normalizeConfirmation(text);
  if (session.pending.length && confirmation !== null) {
    const candidate = session.pending.shift();
    if (confirmation) session.values.push(candidate);
    const decision = branded(confirmation
      ? `تم اعتماد الرقم *〔 ${candidate} 〕* كسعر.`
      : `تم تخطي الرقم *〔 ${candidate} 〕* وعدم إضافته.`);
    return {
      action: confirmation ? 'price-confirmed' : 'price-skipped',
      reply: session.pending.length
        ? `${decision}\n\n${confirmationPrompt(session.pending[0])}`
        : `${decision}\nأرسل أسعارًا أخرى أو *${SUM_COMMAND}* لإتمام الجمع.`
    };
  }

  if ([SUM_COMMAND, LEGACY_SUM_COMMAND].includes(normalized)) {
    if (session.pending.length) {
      return {
        action: 'confirmation-required',
        reply: `${branded('لا أستطيع إكمال الجمع قبل حسم الرقم الملتبس.')}\n\n${confirmationPrompt(session.pending[0])}`
      };
    }
    if (session.values.length === 0) {
      return {
        action: 'empty',
        reply: `${isNewSession ? `${WELCOME_MESSAGE}\n\n` : ''}${branded(`لا توجد أعداد محفوظة بعد. أرسل الأعداد أولًا ثم أرسل ${SUM_COMMAND}.`)}`
      };
    }

    const total = sumDecimals(session.values);
    return {
      action: 'summed',
      total,
      reply: `${branded('✅ *المجموع النهائي:*')}\n\n*〔 ${total} 〕*\n\nللمسح والبدء من جديد أرسل *${CLEAR_COMMAND}*.`
    };
  }

  const filtered = extractPriceCandidates(text);
  const incomingCount = filtered.accepted.length + filtered.ambiguous.length;
  if (incomingCount > 0) {
    if (session.values.length + session.pending.length + incomingCount > MAX_SESSION_VALUES) {
      return {
        action: 'limit',
        reply: branded(`الحد الأقصى ${MAX_SESSION_VALUES} عددًا في الجلسة. أرسل ${CLEAR_COMMAND} لبدء جلسة جديدة.`)
      };
    }

    session.values.push(...filtered.accepted);
    session.pending.push(...filtered.ambiguous);
    if (session.pending.length) {
      return {
        action: 'confirmation-required',
        stored: filtered.accepted.length,
        reply: `${isNewSession ? `${WELCOME_MESSAGE}\n\n` : ''}${confirmationPrompt(session.pending[0])}`
      };
    }

    return {
      action: isNewSession ? 'started-with-prices' : 'prices-added',
      stored: filtered.accepted.length,
      reply: isNewSession
        ? `${WELCOME_MESSAGE}\n\nاستلمت ${filtered.accepted.length} سعرًا واضحًا. أرسل *${SUM_COMMAND}* عندما تريد الحساب.`
        : null
    };
  }

  if (session.pending.length) {
    return { action: 'confirmation-required', reply: confirmationPrompt(session.pending[0]) };
  }

  if (filtered.hadNumericTokens || filtered.ignored.length) {
    return { action: 'filtered', reply: null };
  }

  return {
    action: isNewSession ? 'started' : 'help',
    reply: isNewSession
      ? WELCOME_MESSAGE
      : branded(`أرسل أعدادًا فقط، أو ${SUM_COMMAND} للحساب، أو ${CLEAR_COMMAND} لمسح الجلسة.`)
  };
}

module.exports = {
  BRAND_NAME,
  CLEAR_COMMAND,
  MAX_SESSION_VALUES,
  SUM_COMMAND,
  WELCOME_MESSAGE,
  confirmationPrompt,
  handleSessionMessage,
  normalizeConfirmation
};