const { publicLegal } = require("../config/legal");
const legalService = require("../services/legalService");

/**
 * Адреса документов и текущая редакция. Без токена: это то, что клиент должен
 * знать ещё на экране регистрации, то есть до того, как у него появится
 * сессия.
 */
const getLegal = (req, res) => res.json(publicLegal());

/** Согласие текущего пользователя. Кто именно — берётся из токена. */
const acceptLegal = async (req, res) => {
  try {
    res.json(await legalService.accept(req.user.id));
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error accepting legal documents" });
  }
};

module.exports = { getLegal, acceptLegal };
