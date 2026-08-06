const minioClient = require("./minio");

/**
 * Two buckets, split by who may read them — anonymous access is a bucket-level
 * setting, so it is the only thing worth splitting on. Everything else
 * (mission, kind of file, locale) is a key prefix.
 */
const PUBLIC_BUCKET = process.env.MINIO_PUBLIC_BUCKET || "sttm-public";
const PRIVATE_BUCKET = process.env.MINIO_PRIVATE_BUCKET || "sttm-private";

/** Prefixes inside the public bucket that anyone may GET. */
const PUBLIC_PREFIXES = ["missions/", "skins/"];

const useSSL = process.env.MINIO_USE_SSL === "true";

/**
 * Base URL the browser uses for public objects. Behind a reverse proxy this
 * differs from the address the server connects to, hence the override.
 */
const PUBLIC_BASE_URL = (
  process.env.MINIO_PUBLIC_URL ||
  `${useSSL ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${
    process.env.MINIO_PORT || 9000
  }`
).replace(/\/+$/, "");

const anonymousReadPolicy = (bucket) => ({
  Version: "2012-10-17",
  Statement: PUBLIC_PREFIXES.map((prefix) => ({
    Effect: "Allow",
    Principal: { AWS: ["*"] },
    Action: ["s3:GetObject"],
    Resource: [`arn:aws:s3:::${bucket}/${prefix}*`],
  })),
});

/**
 * Creates the buckets and (re)applies the anonymous policy.
 *
 * Kept as a single cached promise: every upload awaits it, but the round trip
 * to MinIO only happens once per process.
 */
let bootstrap = null;

const ensureBuckets = () => {
  if (!bootstrap) {
    bootstrap = (async () => {
      for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
        const exists = await minioClient.bucketExists(bucket);
        if (!exists) {
          await minioClient.makeBucket(bucket);
        }
      }

      // Only the listed prefixes are public — an object dropped in the bucket
      // root stays private even in the public bucket.
      await minioClient.setBucketPolicy(
        PUBLIC_BUCKET,
        JSON.stringify(anonymousReadPolicy(PUBLIC_BUCKET)),
      );
    })().catch((error) => {
      // Do not cache the failure: a MinIO restart should not poison the process.
      bootstrap = null;
      throw error;
    });
  }

  return bootstrap;
};

module.exports = {
  PUBLIC_BUCKET,
  PRIVATE_BUCKET,
  PUBLIC_PREFIXES,
  PUBLIC_BASE_URL,
  ensureBuckets,
};
