const multer = require("multer");

/** Per-file cap. Files are held in memory only until they reach MinIO. */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * The video is the one field allowed past that cap — a mission clip does not
 * fit in 50 MB. Still bounded, because multer keeps the whole file in memory.
 */
const MAX_VIDEO_SIZE = 300 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
];

/**
 * Только PDF: конспект, презентация и инструкция выдаются подписанной ссылкой
 * с `Content-Disposition: inline` (см. `getPrivateUrl` в storageService), а
 * открыть во вкладке браузер умеет лишь PDF — doc/docx/ppt/pptx он вместо
 * этого предлагает скачать.
 */
const DOCUMENT_TYPES = ["application/pdf"];

/**
 * How many facts one mission may carry. The form sends a fact's picture as
 * `factImage_<index>`, and multer needs every field name up front, so the cap
 * lives here as well as in the controller.
 */
const MAX_FACTS = 20;

const FACT_IMAGE_FIELDS = Object.fromEntries(
  Array.from({ length: MAX_FACTS }, (_, index) => [
    `factImage_${index}`,
    IMAGE_TYPES,
  ]),
);

const ALLOWED_TYPES = {
  ...FACT_IMAGE_FIELDS,
  cover: IMAGE_TYPES,
  videoRu: VIDEO_TYPES,
  videoUz: VIDEO_TYPES,
  documentRu: DOCUMENT_TYPES,
  documentUz: DOCUMENT_TYPES,
  teacherGuideRu: DOCUMENT_TYPES,
  teacherGuideUz: DOCUMENT_TYPES,
  lessonNotesRu: DOCUMENT_TYPES,
  lessonNotesUz: DOCUMENT_TYPES,
};

/** Fields that carry a video, allowed past the smaller per-file cap. */
const VIDEO_FIELDS = ["videoRu", "videoUz"];

const MISSION_FILE_FIELDS = Object.keys(ALLOWED_TYPES).map((name) => ({
  name,
  maxCount: 1,
}));

const upload = multer({
  storage: multer.memoryStorage(),
  // multer knows a single size limit, so it gets the largest one; the smaller
  // cap for everything but the video is checked once the upload is parsed.
  limits: { fileSize: MAX_VIDEO_SIZE, files: MISSION_FILE_FIELDS.length },
  fileFilter: (req, file, callback) => {
    const allowed = ALLOWED_TYPES[file.fieldname];
    if (allowed && !allowed.includes(file.mimetype)) {
      const error = new Error(`Unsupported file type for ${file.fieldname}`);
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

const missionFiles = upload.fields(MISSION_FILE_FIELDS);

/** A test form carries one file: its cover. */
const TEST_FILE_FIELDS = [{ name: "cover", maxCount: 1 }];
const testFiles = upload.fields(TEST_FILE_FIELDS);

/**
 * Browsers send the file name as UTF-8 bytes, but multipart headers are parsed
 * as latin1 — «Инструкция.pdf» arrives as `ÐÐ½ÑÑÑÑÐºÑÐ¸Ñ.pdf`. Re-decoding
 * fixes it; if the result is not valid UTF-8 the original name is kept.
 */
const decodeFileName = (name) => {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
};

/** First file that is over the cap of its own field, if any. */
const oversizedFile = (req) =>
  Object.entries(req.files ?? {})
    .flatMap(([field, list]) => list.map((file) => ({ field, file })))
    .find(
      ({ field, file }) =>
        !VIDEO_FIELDS.includes(field) && file.size > MAX_FILE_SIZE,
    );

const normalizeFileNames = (req) => {
  Object.values(req.files ?? {}).forEach((list) =>
    list.forEach((file) => {
      file.originalname = decodeFileName(file.originalname);
    }),
  );
};

/** Turns multer's own failures into the same JSON shape as the controllers. */
const handleUploadErrors = (middleware) => (req, res, next) =>
  middleware(req, res, (error) => {
    if (!error) {
      const oversized = oversizedFile(req);
      if (oversized) {
        return res.status(400).json({
          message: `File is too large, the limit is ${
            MAX_FILE_SIZE / 1024 / 1024
          } MB`,
        });
      }

      normalizeFileNames(req);
      return next();
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File is too large, the limit is ${MAX_VIDEO_SIZE / 1024 / 1024} MB`
          : error.message;
      return res.status(400).json({ message });
    }

    res.status(error.status || 500).json({ message: error.message });
  });

module.exports = {
  MAX_FILE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_FACTS,
  missionFiles: handleUploadErrors(missionFiles),
  testFiles: handleUploadErrors(testFiles),
};
