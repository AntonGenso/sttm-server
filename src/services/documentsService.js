const minioClient = require("../config/minio");

const BUCKET_NAME = "sttm-documents";

const ensureBucket = async () => {
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME);
  }
};

const getDocuments = async () => {
  try {
    await ensureBucket();

    const documents = await new Promise((resolve, reject) => {
      const result = [];
      const stream = minioClient.listObjectsV2(BUCKET_NAME, "", true);

      stream.on("data", (obj) => {
        result.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          etag: obj.etag,
        });
      });
      stream.on("end", () => resolve(result));
      stream.on("error", (error) => reject(error));
    });

    return documents;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching documents");
  }
};

module.exports = {
  getDocuments,
};
