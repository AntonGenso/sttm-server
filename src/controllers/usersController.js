const services = require("../services/usersService");
const authService = require("../services/authService");
const profileService = require("../services/profileService");
const consentService = require("../services/consentService");
const { parseProfileInput } = require("../utils/profile");

const getUsers = async (req, res) => {
  try {
    const result = await services.getUsers();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await services.getUserById(id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user by ID" });
  }
};

/**
 * Свой профиль в том же виде, в каком его отдают register/login/refresh — чтобы
 * приложение клало ответ в тот же слот и нигде не собирало «пользователя» из
 * двух разных форм.
 */
const getMyProfile = async (req, res) => {
  try {
    res.json(await authService.getAuthUser(req.user.id));
  } catch (error) {
    console.error(error);
    res.status(error.status === 401 ? 401 : 500).json({
      message: error.status === 401 ? error.message : "Error fetching profile",
    });
  }
};

/** Город и школа. Всё остальное в аккаунте отсюда не меняется. */
const updateMyProfile = async (req, res) => {
  try {
    const parsed = parseProfileInput(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    await profileService.updateProfile(req.user.id, parsed.value);
    res.json(await authService.getAuthUser(req.user.id));
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error updating profile" });
  }
};

/** Какие документы программы пользователь ещё не подтвердил. */
const getMyConsents = async (req, res) => {
  try {
    const pending = await consentService.getPendingDocuments(req.user.id);
    res.json({ pending, versions: consentService.CURRENT_VERSIONS });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching consents" });
  }
};

/** Подтверждение из всплывающего окна кабинета: только обе галочки сразу. */
const acceptMyConsents = async (req, res) => {
  try {
    if (req.body.acceptRules !== true || req.body.acceptPrivacy !== true) {
      return res.status(400).json({
        message: "Rules and privacy policy must be accepted",
        code: "CONSENT_REQUIRED",
      });
    }

    await consentService.acceptAll(req.user.id, consentService.requestMeta(req));
    const pending = await consentService.getPendingDocuments(req.user.id);
    res.json({ pending, versions: consentService.CURRENT_VERSIONS });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error saving consents" });
  }
};

module.exports = {
  getUsers,
  getUserById,
  getMyProfile,
  updateMyProfile,
  getMyConsents,
  acceptMyConsents,
};
