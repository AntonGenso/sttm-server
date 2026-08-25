/**
 * Which video codec sits inside an uploaded MP4.
 *
 * A file can be a perfectly valid MP4 and still be unplayable for most of the
 * audience: HEVC (H.265) decodes on Apple devices and almost nowhere else, so
 * Chrome plays the AAC track and leaves the picture black. Nothing in the
 * upload path notices — the mime type is `video/mp4` either way — which is how
 * a mission ends up with a soundtrack instead of a video.
 *
 * So the container is opened just far enough to read the codec of the video
 * track: the `stsd` box inside `moov/trak/mdia/minf/stbl` carries a four
 * character code — `avc1` for H.264, `hvc1`/`hev1` for HEVC.
 *
 * Deliberately forgiving: anything that cannot be parsed (WebM, a truncated or
 * unusual MP4) comes back as `null` and is let through. The check exists to
 * catch a known-bad case, not to be a gatekeeper for container formats.
 */

/** Boxes that hold other boxes on the way to `stsd`. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

/** Codecs a browser is expected to play. */
const SUPPORTED = new Set(["avc1", "avc3", "av01"]);

/** Codecs known to leave most browsers with sound and no picture. */
const KNOWN_UNSUPPORTED = {
  hvc1: "HEVC (H.265)",
  hev1: "HEVC (H.265)",
  hvc2: "HEVC (H.265)",
  dvh1: "Dolby Vision (HEVC)",
  dvhe: "Dolby Vision (HEVC)",
  mp4v: "MPEG-4 Part 2",
};

const HEADER_SIZE = 8;

/**
 * Walks the boxes between `start` and `end`, returning the codec of the first
 * video sample entry it finds.
 *
 * @param {Buffer} buffer
 * @param {number} start
 * @param {number} end
 * @returns {string|null}
 */
const findCodec = (buffer, start, end) => {
  let offset = start;

  while (offset + HEADER_SIZE <= end) {
    let size = buffer.readUInt32BE(offset);
    const kind = buffer.toString("latin1", offset + 4, offset + 8);
    let headerSize = HEADER_SIZE;

    if (size === 1) {
      // 64-bit size, stored right after the type.
      if (offset + 16 > end) return null;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) return null;

    if (kind === "stsd") {
      // version+flags(4) entry count(4), then the first sample entry:
      // size(4) type(4).
      const entry = offset + headerSize + 8;
      if (entry + 8 > end) return null;
      return buffer.toString("latin1", entry + 4, entry + 8);
    }

    if (CONTAINERS.has(kind)) {
      const codec = findCodec(buffer, offset + headerSize, offset + size);
      // A file has a track per stream; keep looking when this one was audio.
      if (codec && codec !== "mp4a") return codec;
    }

    offset += size;
  }

  return null;
};

/**
 * The four character code of the file's video codec, or null when the file is
 * not an MP4 or cannot be read.
 *
 * @param {Buffer} buffer
 * @returns {string|null}
 */
const readVideoCodec = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  try {
    const codec = findCodec(buffer, 0, buffer.length);
    return codec && codec !== "mp4a" ? codec : null;
  } catch {
    return null;
  }
};

/**
 * Human-readable name of the codec when it is one browsers cannot play, and
 * null when the file is fine (or unknown, which counts as fine).
 *
 * @param {Buffer} buffer
 * @returns {string|null}
 */
const unsupportedVideoCodec = (buffer) => {
  const codec = readVideoCodec(buffer);
  if (!codec || SUPPORTED.has(codec)) return null;
  return KNOWN_UNSUPPORTED[codec] ?? null;
};

module.exports = { readVideoCodec, unsupportedVideoCodec };
