const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

const imap = new Imap({
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASS,
  host: process.env.IMAP_HOST,
  port: parseInt(process.env.IMAP_PORT),
  tls: true
});

function openInbox(cb) {
  imap.openBox('INBOX', false, cb); // false = Schreibzugriff, true = nur lesen
}

imap.once('ready', () => {
    openInbox((err, box) => {
        if (err) throw err;

        console.log(`Connected to inbox: ${box.name}`);
        console.log('Listening for new emails...');

        imap.on('mail', (numNewMsgs) => {
            console.log(`${numNewMsgs} new email(s) received!`);

            // Get the highest sequence number (last email)
            imap.search(['ALL'], (err, results) => {
                if (err || !results || results.length === 0) {
                console.error('Error while searching for new emails:', err);
                return;
                }

                const latest = results[results.length - 1]; // last ID
                const fetch = imap.seq.fetch(latest, {
                    bodies: '',
                    struct: true
                });

                fetch.on('message', (msg) => {
                    msg.on('body', async (stream) => {
                        const parsed = await simpleParser(stream);

                        // Variables:
                        const emailSubject = parsed.subject || 'No Subject';
                        const emailFrom = parsed.from.text || 'Unknown Sender';
                        const emailContent = parsed.text || 'No Content';

                        // TODO: Insert email details into database

                        console.log('---');
                        console.log('New Email Received:');
                        console.log(`Subject: ${emailSubject}`);
                        console.log(`From: ${emailFrom}`);
                        console.log(`Content: ${emailContent}\n`);
                    });
                });

                fetch.once('end', () => {
                    console.log('Mail fetch complete.');
                });
            });
        });
    });
});

imap.once('error', (err) => {
  console.error('IMAP Error:', err);
});

imap.once('end', () => {
  console.log('IMAP Connection ended.');
});

imap.connect();