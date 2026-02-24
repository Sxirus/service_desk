const sharp = require("sharp");
const AdmZip = require('adm-zip');
const logger = require('../../utils/logger');

//jpeg/jpg scales
const TARGET_HEIGHT_JPEG = 600;
const JPEG_QUALITY = 80;
const DENSITY_PPI = 180;

//png scales
const TARGET_HEIGHT_PNG = 600;
const compressionLevel_PNG = 9; //0-9

// B9 fix: Maximum attachment size before processing (25 MB)
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

//helpers
function isJpeg(att) {
  const ct = (att.contentType || '').toLowerCase();
  const name = (att.filename || '').toLowerCase();
  return ct === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg');
}

function isHeic(att) {
  const ct = (att.contentType || '').toLowerCase();
  const name = (att.filename || '').toLowerCase();
  return ct === 'image/heic' || ct === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

function isPng(att) {
  const ct = (att.contentType || '').toLowerCase();
  const name = (att.filename || '').toLowerCase();
  return ct === 'image/png' || name.endsWith('.png');
}

function isDocx(att) {
  const ct = (att.contentType || '').toLowerCase();
  logger.info('DOCX content type', { contentType: ct });
  const name = (att.filename || '').toLowerCase();
  return ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
  name.endsWith('.docx')
}

function asJpegFilename(filename) {
  if (!filename) return 'file.jpg';
  return filename.replace(/\.(heic|heif|jpeg|jpg)$/i, '') + '.jpeg';
}

//function to scale down the attachments
async function downscaleAttachments(attachments) {
  logger.info("[Attachment Handler] Entered Downscaling");
  let downsized = [];
  for (const att of attachments) {
    try {
      const sizeBefore = att.size;
      logger.info('Size before: ' + (sizeBefore / (1024 * 1024)).toFixed(2));

      // B9 fix: Skip attachments exceeding the size limit
      if (sizeBefore > MAX_ATTACHMENT_SIZE_BYTES) {
        logger.warn('[Attachment Handler] Attachment exceeds size limit, skipping', {
          filename: att.filename,
          sizeMB: (sizeBefore / (1024 * 1024)).toFixed(2),
          limitMB: (MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        });
        continue;
      }

      let data;
      let outContentType = att.contentType;
      let outFilename = att.filename;

      if (isJpeg(att) || isHeic(att)) {
        data = await scalejpeg(att);
        outContentType = 'image/jpeg';
        outFilename = asJpegFilename(att.filename);
      } else if (isPng(att)){
        data = await scalePng(att.content);
        outContentType = 'image/png';
        outFilename = att.filename.replace(/\.png$/i, '.png');
      } else if (isDocx(att)){
        logger.info('[DOCX] compressing', { filename: att.filename });
        const { buffer, changed } = await compressDocx(att.content);
        data = buffer;
        logger.info(`[DOCX] ${changed} images recompressed`);
      } else {
        //no downscaling for that file type inplemented -> just use the whole attachment
        data = att.content;
      }
      // B10 fix: If downscaled result is larger, fall back to original
      if (data.length > sizeBefore) {
        logger.warn('[Attachment Handler] Downscaled result is larger than original, using original', {
          filename: att.filename,
          originalSize: sizeBefore,
          downscaledSize: data.length
        });
        downsized.push(att);
      } else {
        logger.info('New Size: ' + (data.length / (1024 * 1024)).toFixed(2));
        downsized.push({
          ...att,
          filename: outFilename,
          content: data,
          size: data.length,
          contentType: outContentType || att.contentType
        });
      }

    } catch (error) {
      logger.error("Downscaling error", { error: error.message });
      downsized.push(att); //using non downscaled attachment
    }
  }
  return downsized;
}

// function to scale down a jpeg or jpg
async function scalejpeg(att) {
  logger.info("[Attachment Handler] entered scalejpeg");
  try {
    let pipeline = sharp(att.content, { failOnError: false }).rotate();
    const meta = await pipeline.metadata();

    if (meta.height > TARGET_HEIGHT_JPEG) {
      pipeline = pipeline.resize({ height: TARGET_HEIGHT_JPEG });
    }

    const data = await pipeline
      .withMetadata({ density: DENSITY_PPI })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    
    logger.info("Downscaled data", { size: data.length });
    return data;
  } catch (error) {
    logger.error("Downscaling error in JPEG", { error: error.message })
    throw new Error(error)
  }
}

//function to scale down the png
async function scalePng(inputBuffer) {
  if (!inputBuffer || !Buffer.isBuffer(inputBuffer)) {
    throw new Error('scalePng: input must be a Buffer');
  }
  logger.info('[Attachment Handler] scalePng');

  try {
    let pipeline = sharp(inputBuffer, { failOnError: false }).rotate();
    const meta = await pipeline.metadata();

    if (meta.height && meta.height > TARGET_HEIGHT_PNG) {
      pipeline = pipeline.resize({ height: TARGET_HEIGHT_PNG });
    }

    // Compression: higher compression level = smaller file
    const data = await pipeline
      .png({
        compressionLevel: compressionLevel_PNG,  // 0–9, 9 = maximal
        adaptiveFiltering: true,
        palette: true         // Color reduction, saves space
      })
      .toBuffer();

    return data;
  } catch (err) {
    logger.error('scalePng error', { error: err.message });
    throw err;
  }
}

//downscaling docx
async function compressDocx(inputBuffer, opts = {}) {
  const {
    maxHeight = TARGET_HEIGHT_JPEG || TARGET_HEIGHT_PNG,
    jpegQuality = JPEG_QUALITY,
    pngCompressionLevel = compressionLevel_PNG,
    pngPalette = true
  } = opts;

  const zip = new AdmZip(inputBuffer);
  const newZip = new AdmZip();
  const entries = zip.getEntries();

  let changed = 0;

  async function processImage(entryName, buf) {
    const lower = entryName.toLowerCase();
    const isJpeg = lower.endsWith('.jpg') || lower.endsWith('.jpeg');
    const isPng = lower.endsWith('.png');
    if (!isJpeg && !isPng) return buf;

    try {
      let pipe = sharp(buf, { failOnError: false }).rotate();
      const meta = await pipe.metadata();
      if (meta.height && meta.height > maxHeight) {
        pipe = pipe.resize({ height: maxHeight });
      }

      let out;
      if (isJpeg) {
        out = await pipe.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
      } else {
        out = await pipe.png({
          compressionLevel: pngCompressionLevel,
          adaptiveFiltering: true,
          palette: pngPalette
        }).toBuffer();
      }

      if (out.length < buf.length) {
        changed++;
        return out;
      }
      return buf;
    } catch {
      return buf;
    }
  }

  for (const e of entries) {
    if (e.entryName.startsWith('word/media/')) {
      const processed = await processImage(e.entryName, e.getData());
      newZip.addFile(e.entryName, processed);
    } else {
      newZip.addFile(e.entryName, e.getData());
    }
  }

  return { buffer: newZip.toBuffer(), changed };
}

module.exports = { downscaleAttachments };
