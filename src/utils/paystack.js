const axios = require('axios');
const crypto = require('crypto');

const ps = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});

// ── Transactions ──────────────────────────────────────────────────────────────

const initializePayment = ({ email, amount, reference, metadata, callbackUrl, subaccountCode, bearer, channels }) =>
  ps.post('/transaction/initialize', {
    email,
    amount: Math.round(amount * 100), // kobo
    reference,
    metadata,
    callback_url: callbackUrl,
    ...(subaccountCode && { subaccount: subaccountCode }),
    // bearer='subaccount' → the subaccount bears our platform fee (parent pays gross)
    ...(bearer && { bearer }),
    // prioritise bank_transfer; fallback to card
    channels: channels || ['bank_transfer', 'card', 'ussd'],
  }).then(r => r.data.data);

const verifyPayment = reference =>
  ps.get(`/transaction/verify/${reference}`).then(r => r.data.data);

const verifySignature = (signature, rawBody) =>
  crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody).digest('hex') === signature;

// ── Banks ─────────────────────────────────────────────────────────────────────

/** Returns array of { name, slug, code, ... } */
const listBanks = () =>
  ps.get('/bank', { params: { country: 'nigeria', perPage: 100 } }).then(r => r.data.data);

// ── Account resolution ────────────────────────────────────────────────────────

/** Resolves account number against a bank code → { account_name, account_number } */
const resolveAccount = (accountNumber, bankCode) =>
  ps.get('/bank/resolve', { params: { account_number: accountNumber, bank_code: bankCode } })
    .then(r => r.data.data);

// ── Subaccounts ───────────────────────────────────────────────────────────────

/**
 * Creates a Paystack subaccount for a school.
 * settlement_bank = bank code
 * account_number  = school account number
 * percentage_charge = 100 → all fees go to school minus Paystack charges
 * Settlement schedule: T+1 (auto_settle)
 */
const createSubaccount = ({ businessName, settlementBank, accountNumber, percentageCharge = 100, description }) =>
  ps.post('/subaccount', {
    business_name:     businessName,
    settlement_bank:   settlementBank,
    account_number:    accountNumber,
    percentage_charge: percentageCharge,
    description:       description || businessName,
    // T+1 settlement
    settlement_schedule: 'auto',
  }).then(r => r.data.data);

/**
 * Updates an existing subaccount (if bank details change).
 */
const updateSubaccount = (subaccountId, payload) =>
  ps.put(`/subaccount/${subaccountId}`, payload).then(r => r.data.data);

module.exports = {
  initializePayment, verifyPayment, verifySignature,
  listBanks, resolveAccount,
  createSubaccount, updateSubaccount,
};
