const express = require("express");
const legalController = require("../controllers/legalController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Публично: экран регистрации должен знать адреса документов до входа.
router.get("/", legalController.getLegal);
// Согласие даёт за себя только сам пользователь.
router.post("/accept", authenticate, legalController.acceptLegal);

module.exports = router;
