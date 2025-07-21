// --- imapWorker.js ---
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { saveEmail } = require('./emailHandler');

Imap.prototype._debug = console.log;

function startImapWorker({ email, password, imapHost, imapPort, clientId }) {
    const imap = new Imap({
        user: email,
        password,
        host: imapHost,
        port: imapPort,
        tls: true
    });

    function openInbox(cb) {
        imap.openBox('INBOX', false, cb);
        console.log(`[${email}] INBOX opened`);
    }

    imap.once('ready', () => {
        console.log(`[${email}] Connection ready`);
        openInbox((err) => {
            if (err) return console.error(`[${email}] Error opening inbox:`, err);
            console.log(`[${email}] Listening for new emails...`);

            imap.on('mail', (numNewMsgs) => {
                console.log(`[${email}] mail event triggered: ${numNewMsgs} new messages`);
                const fetch = imap.seq.fetch('*', { bodies: '', struct: true });

                fetch.on('message', (msg) => {
                    msg.on('body', async (stream) => {
                        try {
                            const parsed = await simpleParser(stream);
                            await saveEmail(parsed, clientId);
                        } catch (e) {
                            console.error(`[${email}] Error parsing message:`, e);
                        }
                    });
                });
            });
        });
    });

    imap.once('error', (err) => console.error(`[${email}] IMAP error:`, err));
    imap.once('end', () => console.log(`[${email}] Connection closed.`));
    imap.connect();
    console.log(`[${email}] Connecting...`);
}

module.exports = { startImapWorker };