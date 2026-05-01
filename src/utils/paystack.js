const axios = require('axios');
const crypto = require('crypto');

const ps = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});

const initializePayment = ({ email, amount, reference, metadata, callbackUrl }) =>
  ps.post('/transaction/initialize', {
    email, amount: Math.round(amount * 100), // kobo
    reference, metadata,
    callback_url: callbackUrl,
  }).then(r => r.data.data);

const verifyPayment = reference =>
  ps.get(`/transaction/verify/${reference}`).then(r => r.data.data);

const verifySignature = (signature, rawBody) =>
  crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody).digest('hex') === signature;

module.exports = { initializePayment, verifyPayment, verifySignature };
