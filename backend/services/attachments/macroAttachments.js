const supabase = require('../../config/supabase');
const crypto = require('node:crypto');
const {convertMulterFilesToNodemailerAttachments} = require('./attachmenthandler');
const logger = require('../../utils/logger');

async function storeMacroAttachmentsInDB(attachments, client_id, macro_id, deletedAttachments, parsedOldAttachments) {
  logger.info("[Attachment-Handler-Macro] Saving attachments", { count: attachments.length });
  const formatedAttachments = convertMulterFilesToNodemailerAttachments(attachments);
  const attachmentData = [];
  const oldAttachments = Array.isArray(parsedOldAttachments) ? parsedOldAttachments : [];

  oldAttachments.forEach(att => {
    attachmentData.push(att);
  });

  if (deletedAttachments != null && deletedAttachments.length > 0) {
    await deleteAttachmentsFromStorage(deletedAttachments);
  }

  for(const att of formatedAttachments) {
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
      const objectPath = `${client_id}/${macro_id}/${hash}_${base}`;

      //upload to supabase storage 
      const { error: uploadError } = await supabase.storage
        .from('macro-attachments')
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
        macro_id: macro_id,
        client_id: client_id,
        object_path: objectPath,
        filename: att.filename || base,
        mime_type: att.contentType || 'application/octet-stream',
        byte_size: att.content.byteLength,
        checksum_sha256: checksum
      }
      attachmentData.push(attachmentReference);

    } catch (error){
      logger.error("[Attachment-Handler-Macro] Error saving in the Database", { error });
    }
  }
  try {
    const {data: returnData, error: insertError} = await supabase
      .from('macros')
      .update({attachments: attachmentData})
      .eq('id', macro_id)
      .select()
      .single()

    if (insertError) {
      logger.error('[Attachment-Handler-Macro] Insert error', { error: insertError });
    }
    return returnData;
  } catch (err) {
    logger.error("[Attachment-Handler-Macro] Error saving in the Database", { error: err });
  }
}

async function deleteAttachmentsFromStorage(attachments) {

  try {
    // Extract only the object_paths
    const filePaths = attachments.map(file => file.object_path);
    
    // Deleting all files at once
    const { data, error } = await supabase
      .storage
      .from('macro-attachments')
      .remove(filePaths);
    
    if (error) {
      logger.error('Error deleting', { error });
      return { success: false, error: error.message };
    }
    
    return { 
      success: true, 
      deletedCount: attachments.length,
      message: `${attachments.length} Files deleted` 
    };
    
  } catch (error) {
    logger.error('Unexpected error', { error });
    return { success: false, error: error.message };
  }
}

module.exports = {storeMacroAttachmentsInDB, deleteAttachmentsFromStorage}