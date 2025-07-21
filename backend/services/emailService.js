const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

class EmailService {
  constructor() {
    this.imap = new Imap({
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASS,
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT),
      tls: true
    });

    this.processedMessages = new Set(); // Duplikat-Tracking
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.imap.once('ready', () => {
      console.log('IMAP connection ready');
      this.openInbox();
    });

    this.imap.once('error', (err) => {
      console.error('IMAP Error:', err);
      // Reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    });

    this.imap.once('end', () => {
      console.log('IMAP Connection ended');
    });
  }

  connect() {
    try {
      this.imap.connect();
    } catch (error) {
      console.error('Failed to connect to IMAP:', error);
    }
  }

  openInbox() {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('Error opening inbox:', err);
        return;
      }

      console.log(`Connected to inbox: ${box.name}`);
      console.log('Listening for new emails...');

      this.imap.on('mail', (numNewMsgs) => {
        console.log(`${numNewMsgs} new email(s) received!`);
        this.processNewEmails();
      });
    });
  }

  processNewEmails() {
    this.imap.search(['ALL'], (err, results) => {
      if (err || !results || results.length === 0) {
        console.error('Error while searching for emails:', err);
        return;
      }

      // Process last 5 emails to catch any missed ones
      const recentEmails = results.slice(-5);
      const fetch = this.imap.seq.fetch(recentEmails, {
        bodies: '',
        struct: true
      });

      fetch.on('message', (msg) => {
        let messageId = null;
        
        msg.on('attributes', (attrs) => {
          messageId = attrs.uid;
        });

        msg.on('body', async (stream) => {
          try {
            if (this.processedMessages.has(messageId)) {
              console.log(`Email ${messageId} already processed, skipping`);
              return;
            }

            const parsed = await simpleParser(stream);
            const emailData = this.extractEmailData(parsed);
            
            // TODO: Save to database when Jakob is ready
            console.log('Processed email:', emailData.subject);
            
            this.processedMessages.add(messageId);
          } catch (error) {
            console.error('Error processing email:', error);
          }
        });
      });

      fetch.once('end', () => {
        console.log('Email fetch complete');
      });
    });
  }

  extractEmailData(parsed) {
    return {
      messageId: parsed.messageId,
      subject: parsed.subject || 'No Subject',
      from: {
        email: parsed.from?.value?.[0]?.address || 'unknown@unknown.com',
        name: parsed.from?.value?.[0]?.name || 'Unknown Sender'
      },
      to: parsed.to?.value?.map(addr => ({
        email: addr.address,
        name: addr.name
      })) || [],
      date: parsed.date || new Date(),
      textContent: parsed.text || '',
      htmlContent: parsed.html || '',
      attachments: parsed.attachments?.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        content: att.content // Be careful with large files!
      })) || [],
      inReplyTo: parsed.inReplyTo,
      references: parsed.references
    };
  }

  // Graceful shutdown
  disconnect() {
    if (this.imap) {
      this.imap.end();
    }
  }
}

module.exports = EmailService;