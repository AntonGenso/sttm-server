const express = require("express");
const schoolsController = require("../controllers/schoolsController");

const router = express.Router();

// Без авторизации — как и `/cities`: школу выбирают прямо в форме регистрации,
// когда токена ещё нет. Названия школ города и так публичны, а держать
// справочник за авторизацией значило бы, что выбрать школу можно только уже
// зарегистрировавшись — то есть никогда.
//
// `/similar` — до всего остального: это не идентификатор школы, а подсказка.
router.get("/similar", schoolsController.getSimilarSchools);
router.get("/", schoolsController.getSchools);

module.exports = router;
