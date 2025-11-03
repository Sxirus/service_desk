const sharp = require("sharp");
const supabase = require('../../config/supabase');
const crypto = require('crypto');

//jpeg/jpg scales
const TARGET_HEIGHT_JPEG = 600;
const JPEG_QUALITY = 80;
const DENSITY_PPI = 180;

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

function asJpegFilename(filename) {
  if (!filename) return 'file.jpg';
  return filename.replace(/\.(heic|heif|jpeg|jpg)$/i, '') + '.jpeg';
}

//function to scale down the attachments and store them in the database
async function saveAttachment(attachments, clientId, emailId) {
  console.log("[Attachment Handler] Entered Attachment handler");
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

  //saving to storage
  storeAttachmentInDB(clientId, emailId, downsized);
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

//Function for uploading the attachments to storage
async function storeAttachmentInDB(clientId, emailId, attachments) {
  for (const att of attachments) {
    try {
      console.log("Content Type: ",att.contentType);
      const base = (att.filename || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');

      //hash for an indiviual path
      let hash = null;
      try {
        hash = crypto.createHash('sha256').update(att.content).digest('hex').slice(0, 8);
      } catch (error) {
        console.log("error hashing", error)
        hash = crypto.randomBytes(8).toString('hex');
      }
      const objectPath = `${clientId}/${emailId}/${hash}_${base}`;

      //upload to supabase storage 
      const { error: uploadError } = await supabase.storage
        .from('mail-attachments')
        .upload(objectPath, att.content, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload-Fehler:', uploadError);
        throw uploadError;
      }else {
        console.log("Uploaded Attachment to DB", att.filename);
      }

      //checksum
      const checksum = crypto.createHash('sha256').update(att.content).digest('hex');

      //store reference in email-attachments
      const { error: insertError } = await supabase
        .from('email-attachments')
        .insert({
          email_id: emailId,
          client_id: clientId,
          object_path: objectPath,
          filename: att.filename || base,
          mime_type: att.contentType || 'application/octet-stream',
          byte_size: att.content.byteLength,
          checksum_sha256: checksum
        });

      if (insertError) {
        console.error('Insert-Fehler:', insertError);
        throw insertError;
      }
    } catch (error) {
      console.log("Error saving in the database", error);
      throw new Error(error);
    }
  }
}

module.exports = { saveAttachment };