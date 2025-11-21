const sharp = require("sharp");
const AdmZip = require('adm-zip');

//jpeg/jpg scales
const TARGET_HEIGHT_JPEG = 600;
const JPEG_QUALITY = 80;
const DENSITY_PPI = 180;

//png scales
const TARGET_HEIGHT_PNG = 600;
const compressionLevel_PNG = 9; //0-9

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
  console.log('DOCX content type', ct);
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
  console.log("[Attachment Handler] Entered Downscaling");
  downsized = [];
  for (const att of attachments) {
    try {
      const sizeBefore = att.size;
      console.log("Size before:", (sizeBefore / (1024 * 1024)).toFixed(2));

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
        console.log('[DOCX] compressing', att.filename);
        const { buffer, changed } = await compressDocx(att.content);
        data = buffer;
        console.log(`[DOCX] ${changed} images recompressed`);
      } else {
        //no downscaling for that file type inplemented -> just use the whole attachment
        data = att.content;
      }
      if (data.length > sizeBefore) {
        console.log("!!!DOWNSCALING FAILED!!! Data is bigger then before");
      } else {
        console.log("New Size:", (data.length / (1024 * 1024)).toFixed(2));
      }

        downsized.push({
        ...att,
        filename: outFilename,
        content: data,
        size: data ? data.length : att.size,
        contentType: outContentType || att.contentType
      });

    } catch (error) {
      console.log("Downsclaing Error", error);
      downsized.push(att); //using non downscaled attachment
    }
  }
  return downsized;
}

// function to scale down a jpeg or jpg
async function scalejpeg(att) {
  console.log("[Attachment Handler] entered scalejpeg");
  try {
    let pipeline = sharp(att.content, { failOnError: false }).rotate();
    const meta = await pipeline.metadata();

    if (meta.height > TARGET_HEIGHT_JPEG) {
      pipeline = pipeline.resize({ height: TARGET_HEIGHT_JPEG });
    }

    data = await pipeline
      .withMetadata({ density: DENSITY_PPI })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    
    console.log("Downscaled data:",data);
    return data;
  } catch (error) {
    console.log("Downscaling Error in Jpeg", error)
    throw new Error(error)
  }
}

//function to scale down the png
async function scalePng(inputBuffer) {
  if (!inputBuffer || !Buffer.isBuffer(inputBuffer)) {
    throw new Error('scalePng: input must be a Buffer');
  }
  console.log('[Attachment Handler] scalePng');

  try {
    let pipeline = sharp(inputBuffer, { failOnError: false }).rotate();
    const meta = await pipeline.metadata();

    if (meta.height && meta.height > TARGET_HEIGHT_PNG) {
      pipeline = pipeline.resize({ height: TARGET_HEIGHT_PNG });
    }

    // Kompression: hohe Kompressionsstufe = kleinere Datei
    const data = await pipeline
      .png({
        compressionLevel: compressionLevel_PNG,  // 0–9, 9 = maximal
        adaptiveFiltering: true,
        palette: true         // Farbreduktion, spart Platz
      })
      .toBuffer();

    return data;
  } catch (err) {
    console.error('scalePng error', err);
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