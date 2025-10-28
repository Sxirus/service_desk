const sharp = require("sharp");
const supabase = require('../../config/supabase');
const crypto = require('crypto');

//jpeg scales
const TARGET_HEIGHT = 600;
const JPEG_QUALITY = 80;
const DENSITY_PPI = 180;

async function saveAttachment(attachments, clientId, emailId) {
  console.log("[Attachment Handler] Entered Attachment handler");
  downsized = [];
  for (const att of attachments) {
    try {
      const sizeBefore = att.size;
      console.log("Size before:", (sizeBefore / (1024 * 1024)).toFixed(2));

      const ct = att.contentType;
      const ext = (att.filename || "").toLowerCase();
      const jpeg = ct === "image/jpeg" || ext.endsWith(".jpg") || ext.endsWith(".jpeg");
      if (jpeg) {
        data = await scalejpeg(att);
      } else {
        //no downscaling for that file type inplemented -> just use the whole attachment
        data = att;
      }
      if (data.length > sizeBefore) {
        console.log("!!!DOWNSCALING FAILED!!! Data is bigger then before");
      } else {
        console.log("New Size:", (data.length / (1024 * 1024)).toFixed(2));
      }

        downsized.push({
        ...att,
        content: data,
        size: data.length,
        contentType: data.contentType
      });

    } catch (error) {
      console.log("Downsclaing Error", error);
      downsized.push(att); //using non downscaled attachment
    }
  }

  //saving to storage
  storeAttachmentInDB(clientId, emailId, downsized);
}

async function scalejpeg(att) {
  console.log("[Attachment Handler] entered scalejpeg");
  try {
    let pipeline = sharp(att.content, { failOnError: false }).rotate();
    const meta = await pipeline.metadata();

    if (meta.height > TARGET_HEIGHT) {
      pipeline = pipeline.resize({ height: TARGET_HEIGHT });
    }

    data = await pipeline
      .withMetadata({ density: DENSITY_PPI })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    
    return data;
  } catch (error) {
    console.log("Downscaling Error in Jpeg", error)
    throw new Error(error)
  }
}

async function storeAttachmentInDB(clientId, emailId, attachments) {
  for (const att of attachments) {
    const base = (att.filename || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');

    //hash for an indiviual path
    const hash = crypto.createHash('sha256').update(att.content).digest('hex').slice(0, 8);
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
  }
}

module.exports = { saveAttachment };