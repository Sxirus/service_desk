const sharp = require("sharp");

//jpeg scales
const TARGET_HEIGHT = 600;
const JPEG_QUALITY = 80;
const DENSITY_PPI = 180;

async function saveAttachment(attachments) {
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

module.exports = { saveAttachment };