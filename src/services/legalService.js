const pool = require("../config/db");
const { legalConfig, isLegalEnabled } = require("../config/legal");

/**
 * Согласие пользователя с правилами участия и политикой конфиденциальности.
 *
 * Хранится не галочкой, а парой «когда» + «с какой редакцией»: документы будут
 * меняться, и согласие со старой редакцией не является согласием с новой.
 */

/**
 * Принял ли пользователь ДЕЙСТВУЮЩУЮ редакцию.
 *
 * Пока документов нет, механизм выключен и считается принятым у всех — иначе
 * заготовка заблокировала бы работающее приложение.
 */
const isAccepted = (profile) => {
  if (!isLegalEnabled()) {
    return true;
  }
  const { version } = legalConfig();
  return Boolean(profile?.terms_accepted_at) &&
    profile?.terms_version === version;
};

/**
 * Записывает согласие текущей редакции. Повторный вызов просто обновляет дату —
 * человек мог принять старую редакцию, а теперь принимает новую.
 */
const accept = async (userId, executor = pool) => {
  if (!isLegalEnabled()) {
    const error = new Error("Legal documents are not published yet");
    error.status = 409;
    throw error;
  }

  const { version } = legalConfig();
  await executor.query(
    `UPDATE users SET terms_accepted_at = NOW(), terms_version = ? WHERE id = ?`,
    [version, userId],
  );

  return { accepted: true, version };
};

module.exports = { isAccepted, accept };
