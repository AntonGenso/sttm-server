/**
 * Правила участия и политика конфиденциальности.
 *
 * Документов ещё нет, поэтому весь механизм выключен: пока в окружении не
 * заданы ВСЕ три переменные, `isLegalEnabled()` возвращает false, согласие не
 * спрашивается ни при регистрации, ни у уже заведённых аккаунтов, и клиенты
 * ничего про него не рисуют.
 *
 * Появятся документы — достаточно выставить переменные и перезапустить сервер.
 * Ни правок в коде, ни новой выкатки клиентов не потребуется: и панель, и игра
 * берут эти значения из `GET /legal`.
 *
 * Требуются все три сразу: галочка без ссылок — это согласие вслепую, а версия
 * нужна, чтобы при смене редакции согласие можно было собрать заново.
 */
const legalConfig = () => ({
  version: process.env.LEGAL_VERSION || null,
  termsUrl: process.env.LEGAL_TERMS_URL || null,
  privacyUrl: process.env.LEGAL_PRIVACY_URL || null,
});

const isLegalEnabled = () => {
  const { version, termsUrl, privacyUrl } = legalConfig();
  return Boolean(version && termsUrl && privacyUrl);
};

/** То, что отдаётся клиентам: без секретов, поэтому доступно и без токена. */
const publicLegal = () => {
  const { version, termsUrl, privacyUrl } = legalConfig();
  return {
    enabled: isLegalEnabled(),
    version,
    terms_url: termsUrl,
    privacy_url: privacyUrl,
  };
};

module.exports = { legalConfig, isLegalEnabled, publicLegal };
