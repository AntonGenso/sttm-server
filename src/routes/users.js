const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");
const { authenticate, requireRole } = require("../middleware/auth");

// Свой профиль — до `/:id`, иначе «me» уедет в него как в идентификатор.
router.get("/me", authenticate, usersController.getMyProfile);
router.patch("/me", authenticate, usersController.updateMyProfile);
router.get("/me/consents", authenticate, usersController.getMyConsents);
router.post("/me/consents", authenticate, usersController.acceptMyConsents);

// Оба списка отдают строки `users` целиком, включая хеш пароля, поэтому дальше
// админа они не уходят.
router.get("/", authenticate, requireRole("admin"), usersController.getUsers);
router.get("/:id", authenticate, requireRole("admin"), usersController.getUserById);

module.exports = router;
