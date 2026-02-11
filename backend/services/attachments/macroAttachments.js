const supabase = require('../../config/supabase');
const crypto = require('node:crypto');
const {convertMulterFilesToNodemailerAttachments} = require('./attachmenthandler');

async function storeMacroAttachmentsInDB(attachments, client_id, macro_id, deletedAttachments, parsedOldAttachments) {
  console.log("[Attachment-Handler-Macro] Saving attachments", attachments.length);
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
      console.log("Content Type: ", att.contentType);
      const base = (att.filename || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');

      //hash for an indiviual path
      let hash = null;
      try {
        hash = crypto.createHash('sha256').update(att.content).digest('hex').slice(0, 8);
      } catch (error) {
        console.log("error hashing", error)
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
        console.error('Upload-Fehler:', uploadError);
        throw uploadError;
      }else {
        console.log("Uploaded Attachment to DB", att.filename);
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
      console.log("[Attachment-Handler-Macro] Error saving in the Database", error);
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
      console.error('[Attachment-Handler-Macro] Insert-Fehler:', insertError);
    }
    return returnData;
  } catch (err) {
    console.log("[Attachment-Handler-Macro] Error saving in the Database", err);
  }
}

async function deleteAttachmentsFromStorage(attachments) {

  try {
    // Extrahiere nur die object_paths
    const filePaths = attachments.map(file => file.object_path);
    
    // Lösche alle Dateien auf einmal
    const { data, error } = await supabase
      .storage
      .from('macro-attachments')
      .remove(filePaths);
    
    if (error) {
      console.error('Fehler beim Löschen:', error);
      return { success: false, error: error.message };
    }
    
    return { 
      success: true, 
      deletedCount: attachments.length,
      message: `${attachments.length} Dateien gelöscht` 
    };
    
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {storeMacroAttachmentsInDB, deleteAttachmentsFromStorage}