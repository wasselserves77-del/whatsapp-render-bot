const { parseNumberList, sumDecimals } = require('./decimal');

const SUM_COMMAND = 'oslo';
const LEGACY_SUM_COMMAND = 'olso';
const CLEAR_COMMAND = 'oslo_d';
const MAX_SESSION_VALUES = 200;
const BRAND_NAME = 'mezan_ ميزان';
const BRAND_HEADER = `\u200f*${BRAND_NAME}*\u200f`;

function branded(message) {
  return `${BRAND_HEADER}\n${message}`;
}

const WELCOME_MESSAGE = [
  branded('مرحبًا بك. أنا جاهز لاستقبال الأعداد.'),
  '',
  '*طريقة الاستخدام:*',
  '• أرسل الأعداد مفصولة بفواصل، أو كل عدد في سطر، أو في رسائل منفصلة.',
  `• لن أحسب حتى ترسل الأمر *${SUM_COMMAND}*.`,
  `• بعد ظهور النتيجة، أرسل *${CLEAR_COMMAND}* لمسح الجلسة والبدء من جديد.`
].join('\n');

function parseValues(text) {
  try {
    const values = parseNumberList(text);
    return values.length ? values : null;
  } catch {
    return null;
  }
}

function handleSessionMessage(sessions, sender, text) {
  const normalized = String(text || '').trim().toLowerCase();
  let session = sessions.get(sender);
  const isNewSession = !session;

  if (!session) {
    session = { values: [] };
    sessions.set(sender, session);
  }

  if (normalized === CLEAR_COMMAND) {
    session.values = [];
    return {
      action: 'cleared',
      reply: branded(`تم حذف أعداد جلستك. أرسل الأعداد الجديدة، ثم أرسل ${SUM_COMMAND} لحساب مجموعها.`)
    };
  }

  if ([SUM_COMMAND, LEGACY_SUM_COMMAND].includes(normalized)) {
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

  const values = parseValues(text);
  if (values) {
    if (session.values.length + values.length > MAX_SESSION_VALUES) {
      return {
        action: 'limit',
        reply: branded(`الحد الأقصى ${MAX_SESSION_VALUES} عددًا في الجلسة. أرسل ${CLEAR_COMMAND} لبدء جلسة جديدة.`)
      };
    }

    session.values.push(...values);
    return {
      action: isNewSession ? 'started-with-values' : 'values-added',
      stored: values.length,
      reply: isNewSession
        ? `${WELCOME_MESSAGE}\n\nاستلمت أعداد هذه الرسالة أيضًا. أرسل ${SUM_COMMAND} عندما تريد حسابها.`
        : null
    };
  }

  return {
    action: isNewSession ? 'started' : 'help',
    reply: isNewSession
      ? WELCOME_MESSAGE
      : branded(`أرسل أعدادًا فقط، أو ${SUM_COMMAND} للحساب، أو ${CLEAR_COMMAND} لمسح الجلسة.`)
  };
}

module.exports = { BRAND_NAME, CLEAR_COMMAND, MAX_SESSION_VALUES, SUM_COMMAND, WELCOME_MESSAGE, handleSessionMessage };