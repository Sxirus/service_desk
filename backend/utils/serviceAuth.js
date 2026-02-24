const crypto = require('node:crypto');

function createServiceSignature(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const normalizedBody = JSON.stringify(body ?? {});
  const bodyHash = crypto.createHash('sha256').update(normalizedBody).digest('hex');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${bodyHash}`)
    .digest('hex');

  return {
    timestamp,
    signature
  };
}

module.exports = {
  createServiceSignature
};
