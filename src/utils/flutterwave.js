const axios = require('axios');

const fw = axios.create({
  baseURL: 'https://api.flutterwave.com/v3',
  headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
});

const initializePayment = async ({ email, amount, reference, name, phone, callbackUrl }) => {
  const { data } = await fw.post('/payments', {
    tx_ref:   reference,
    amount,
    currency: 'NGN',
    redirect_url: callbackUrl,
    customer:     { email, name, phone_number: phone },
    customizations: { title: 'School Fees', description: 'ApexSchool fees payment' },
  });
  return data.data; // { link: payment_url }
};

const verifyPayment = async (id) => {
  const { data } = await fw.get(`/transactions/${id}/verify`);
  return data.data;
};

module.exports = { initializePayment, verifyPayment };
