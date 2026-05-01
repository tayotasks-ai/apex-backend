const axios = require('axios');

/**
 * Send SMS via Termii
 * @param {string|string[]} to   – phone number(s) in international format e.g. +2348012345678
 * @param {string}          body – message body
 */
const sendSMS = async (to, body) => {
  if (!process.env.TERMII_API_KEY) {
    console.warn('[SMS] TERMII_API_KEY not set – skipping SMS');
    return { skipped: true };
  }
  const numbers = Array.isArray(to) ? to : [to];
  const results = [];
  for (const num of numbers) {
    try {
      const { data } = await axios.post('https://api.ng.termii.com/api/sms/send', {
        to:      num.replace(/\s+/g, ''),
        from:    process.env.TERMII_SENDER_ID || 'ApexSchool',
        sms:     body,
        type:    'plain',
        channel: 'generic',
        api_key: process.env.TERMII_API_KEY,
      });
      results.push({ to: num, ok: true, data });
    } catch (e) {
      console.error('[SMS] Failed to', num, e?.response?.data || e.message);
      results.push({ to: num, ok: false });
    }
  }
  return results;
};

module.exports = { sendSMS };
