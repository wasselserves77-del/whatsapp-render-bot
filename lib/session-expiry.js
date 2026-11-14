const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function clearSessionTimer(session, clearTimeoutFn = clearTimeout) {
  if (session?.expiryTimer) clearTimeoutFn(session.expiryTimer);
  if (session) session.expiryTimer = null;
}

function scheduleSessionExpiry(sessions, sender, onExpire, options = {}) {
  const session = sessions.get(sender);
  if (!session || (!session.values?.length && !session.pending?.length)) return false;

  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  const delayMs = options.delayMs ?? SESSION_TTL_MS;
  clearSessionTimer(session, clearTimeoutFn);
  const timer = setTimeoutFn(async () => {
    if (sessions.get(sender) !== session) return;
    session.values = [];
    session.pending = [];
    session.expiryTimer = null;
    sessions.delete(sender);
    try {
      await onExpire(sender);
    } catch (error) {
      console.error('Session expiry notification failed:', error.message);
    }
  }, delayMs);

  session.expiryTimer = timer;
  timer?.unref?.();
  return true;
}

module.exports = { SESSION_TTL_MS, clearSessionTimer, scheduleSessionExpiry };