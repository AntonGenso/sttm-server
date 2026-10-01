const pool = require("../config/db");

/**
 * Согласия с документами пилотной программы (см. 016_user_consents.sql).
 *
 * Версия — дата вступления редакции в силу. Выпустили новую редакцию PDF —
 * поднимаем версию здесь, и кабинет снова попросит подтверждение у всех.
 */
const CURRENT_VERSIONS = {
  rules: "2026-09-01",
  privacy: "2026-09-01",
};

const DOCUMENTS = Object.keys(CURRENT_VERSIONS);

/** Документы, текущую редакцию которых пользователь ещё не подтвердил. */
const getPendingDocuments = async (userId, executor = pool) => {
  const [rows] = await executor.query(
    "SELECT document, version FROM user_consents WHERE user_id = ?",
    [userId],
  );
  return DOCUMENTS.filter(
    (doc) =>
      !rows.some((r) => r.document === doc && r.version === CURRENT_VERSIONS[doc]),
  );
};

/**
 * Пишет подтверждение текущих редакций всех документов. Повтор не ломается и
 * не сдвигает исходные дату и время: INSERT IGNORE по уникальному ключу.
 */
const acceptAll = async (userId, { ip = null, userAgent = null } = {}, executor = pool) => {
  const values = DOCUMENTS.map((doc) => [
    userId,
    doc,
    CURRENT_VERSIONS[doc],
    ip,
    userAgent ? String(userAgent).slice(0, 512) : null,
  ]);
  await executor.query(
    "INSERT IGNORE INTO user_consents (user_id, document, version, ip, user_agent) VALUES ?",
    [values],
  );
};

/** Источник запроса для журнала согласий. */
const requestMeta = (req) => ({
  ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || null,
  userAgent: req.headers["user-agent"] || null,
});

module.exports = {
  CURRENT_VERSIONS,
  getPendingDocuments,
  acceptAll,
  requestMeta,
};
