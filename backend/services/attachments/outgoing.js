const supabase = require('../../config/supabase');
const crypto = require('node:crypto');
const {downscaleAttachments, convertMulterFilesToNodemailerAttachments} = require('./attachmenthandler')

async function storeOutgoingAttachmentsInDB(attachments, clientId, emailId) {
  console.log("[Attachment-Handler-Outgoing] Saving attachments", attachments.length);
  const formatedAttachments = convertMulterFilesToNodemailerAttachments(attachments)
  const downscaledAttachments = await downscaleAttachments(formatedAttachments);
  const attachmentData = [];
  for (const att of downscaledAttachments) {
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
      const objectPath = `${clientId}/${emailId}/${hash}_${base}`;

      //upload to supabase storage 
      const { error: uploadError } = await supabase.storage
        .from('sent-attachments')
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
      const attachmentReference= {
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
      console.log("[Attachment-Handler-Outgoing] Error saving in the Database", error);
    }
  }
  try {
    const {error: insertError} = await supabase
      .from('sent-mail')
      .update({attachments: attachmentData})
      .eq('id', emailId);

    if (insertError) {
      console.error('[Attachment-Handler-Outgoing] Insert-Fehler:', insertError);
    }
  } catch (err) {
    console.log("[Attachment-Handler-Outgoing] Error saving in the Database", err);
  }
}

module.exports = { storeOutgoingAttachmentsInDB }