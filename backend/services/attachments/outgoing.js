const supabase = require('../../config/supabase');
const crypto = require('node:crypto');
const {downscaleAttachments, convertMulterFilesToNodemailerAttachments} = require('./attachmenthandler')
const logger = require('../../utils/logger');

async function storeOutgoingAttachmentsInDB(attachments, clientId, emailId) {
  logger.info("[Attachment-Handler-Outgoing] Saving attachments", { count: attachments.length });
  const formatedAttachments = convertMulterFilesToNodemailerAttachments(attachments);
  const downscaledAttachments = await downscaleAttachments(formatedAttachments);
  const attachmentData = [];
  for (const att of downscaledAttachments) {
    try {
      logger.info("Content Type", { contentType: att.contentType });
      const base = (att.filename || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');

      //hash for an indiviual path
      let hash = null;
      try {
        hash = crypto.createHash('sha256').update(att.content).digest('hex').slice(0, 8);
      } catch (error) {
        logger.error("error hashing", { error })
        hash = crypto.randomBytes(8).toString('hex');
      }
      const objectPath = `${clientId}/${emailId}/${hash}_${base}`;

      //upload to supabase storage 
      const { error: uploadError } = await supabase.storage
        .from('sent-attachments')
        .upload(objectPath, att.content, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        logger.error('Upload error', { error: uploadError });
        throw uploadError;
      }else {
        logger.info("Uploaded Attachment to DB", { filename: att.filename });
      }     
      //checksum
      const checksum = crypto.createHash('sha256').update(att.content).digest('hex');
      
      //attachment data(reference), to save later
      const attachmentReference = {
        email_id: emailId,
        client_id: clientId,
        object_path: objectPath,
        filename: att.filename || base,
        mime_type: att.contentType || 'application/octet-stream',
        byte_size: att.content.byteLength,
        checksum_sha256: checksum
      }
      attachmentData.push(attachmentReference);

    } catch (error){
      logger.error("[Attachment-Handler-Outgoing] Error saving in the Database", { error });
    }
  }
  try {
    const {error: insertError} = await supabase
      .from('sent-mail')
      .update({attachments: attachmentData})
      .eq('id', emailId);

    if (insertError) {
      logger.error('[Attachment-Handler-Outgoing] Insert error', { error: insertError });
    }
  } catch (err) {
    logger.error("[Attachment-Handler-Outgoing] Error saving in the Database", { error: err });
  }
}

module.exports = { storeOutgoingAttachmentsInDB }