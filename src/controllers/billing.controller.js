const { v4: uuid } = require('uuid');
const { School, AcademicSession, Student, Subscription, User } = require('../models');
const { catchAsync, ok, created, ApiError } = require('../utils/helpers');
const { initializePayment: paystackInit, verifyPayment: paystackVerify } = require('../utils/paystack');
const { sendEmail } = require('../utils/resend');
const { subscriptionConfirmed } = require('../utils/emailTemplates');

const PRICE_PER_STUDENT = 2000; // ₦2,000 naira
const SMS_QUOTA_PER_TERM = 1000; // Flat 1,000 SMS per school per term

// ─── Get current subscription status ─────────────────────────────────────────
const getSubscriptionStatus = catchAsync(async (req, res) => {
  const schoolId = req.user.schoolId;
  const school = await School.findById(schoolId).lean();
  const session = await AcademicSession.findOne({ schoolId, isCurrent: true }).lean();

  if (!session) {
    return ok(res, { status: 'no_session', message: 'No active session set', school });
  }

  const sub = await Subscription.findOne({ schoolId, sessionId: session._id }).lean();

  const studentCount = await Student.countDocuments({ schoolId, isActive: true });
  const totalDue = studentCount * PRICE_PER_STUDENT;

  return ok(res, {
    school,
    session: session.name,
    studentCount,
    pricePerStudent: PRICE_PER_STUDENT,
    smsPerStudent: SMS_PER_STUDENT,
    totalDue,
    subscription: sub || null,
    isActive: sub?.status === 'active',
    isPending: sub?.status === 'pending',
    isExpired: !sub || sub.status === 'expired',
    smsQuota: sub?.smsQuota || 0,
    smsUsed:  sub?.smsUsed  || 0,
    smsRemaining: Math.max(0, (sub?.smsQuota || 0) - (sub?.smsUsed || 0)),
    smsQuotaPerTerm: SMS_QUOTA_PER_TERM,
  });
});

// ─── Initialize subscription payment ─────────────────────────────────────────
const initSubscription = catchAsync(async (req, res) => {
  const schoolId = req.user.schoolId;
  const school = await School.findById(schoolId).lean();
  if (!school) throw new ApiError(404, 'School not found');

  const session = await AcademicSession.findOne({ schoolId, isCurrent: true });
  if (!session) throw new ApiError(400, `No active session found for this school (ID: ${schoolId}).`);

  // Check if already active
  const existing = await Subscription.findOne({ schoolId, sessionId: session._id });
  if (existing?.status === 'active') {
    throw new ApiError(409, 'Subscription is already active for this session');
  }

  const studentCount = await Student.countDocuments({ schoolId, isActive: true });
  if (studentCount === 0) {
    throw new ApiError(400, `You have 0 active students in your database. Enroll students before subscribing.`);
  }

  const totalAmount = studentCount * PRICE_PER_STUDENT;
  const reference = `APEX-SUB-${uuid().replace(/-/g, '').slice(0, 14).toUpperCase()}`;

  const admin = await User.findById(req.user.id).lean();
  if (!admin) throw new ApiError(404, 'Admin user not found');

  // Initialize with Paystack
  let paymentData;
  try {
    paymentData = await paystackInit({
      email: admin.email,
      amount: totalAmount,
      reference,
      metadata: {
        type: 'subscription',
        schoolId: schoolId.toString(),
        schoolName: school.name,
        sessionId: session._id.toString(),
        sessionName: session.name,
        studentCount,
        pricePerStudent: PRICE_PER_STUDENT,
      },
      callbackUrl: `${process.env.CLIENT_URL}/admin/billing?ref=${reference}`,
    });
  } catch (err) {
    console.error('Paystack Init Error:', err.response?.data || err.message);
    throw new ApiError(400, `Payment Initialization Failed: ${err.response?.data?.message || err.message}`);
  }

  // Save pending subscription (upsert — in case of retry)
  await Subscription.findOneAndUpdate(
    { schoolId, sessionId: session._id },
    {
      studentCount, pricePerStudent: PRICE_PER_STUDENT, totalAmount,
      reference, gateway: 'paystack', status: 'pending',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return ok(res, {
    authorizationUrl: paymentData.authorization_url,
    reference,
    studentCount,
    totalAmount,
    pricePerStudent: PRICE_PER_STUDENT,
    session: session.name,
  }, 'Payment initialized');
});

// ─── Verify subscription payment ──────────────────────────────────────────────
const verifySubscription = catchAsync(async (req, res) => {
  const { reference } = req.params;
  const sub = await Subscription.findOne({ reference });
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (sub.status === 'active') return ok(res, sub, 'Subscription already active ✅');

  const data = await paystackVerify(reference);
  if (data.status !== 'success') {
    return ok(res, { status: data.status, message: 'Payment not yet confirmed' });
  }

  const session = await AcademicSession.findById(sub.sessionId);
  const school = await School.findById(sub.schoolId);

  // Update subscription record
  sub.status = 'active';
  sub.paidAt = new Date();
  sub.expiresAt = session?.endDate || new Date(Date.now() + 120 * 24 * 3600 * 1000);
  sub.smsQuota = SMS_QUOTA_PER_TERM;  // flat 1,000 SMS per school per term
  sub.metadata = data;
  await sub.save();

  // Send confirmation email
  await sendEmail({
    to: school.email,
    subject: `Subscription Activated - ${school.name}`,
    html: subscriptionConfirmed({
      schoolName: school.name,
      sessionName: session?.name || 'Current Term',
      reference: sub.reference,
      studentCount: sub.studentCount,
      totalAmount: sub.totalAmount.toLocaleString(),
      paidDate: new Date(sub.paidAt).toLocaleDateString(),
      expiresDate: new Date(sub.expiresAt).toLocaleDateString(),
    })
  });

  return ok(res, sub, '✅ Subscription activated! Your school is now fully operational.');
});

// ─── Paystack webhook for subscription ───────────────────────────────────────
const subscriptionWebhook = async (req, res) => {
  res.sendStatus(200);
  const { verifySignature } = require('../utils/paystack');
  if (!verifySignature(req.headers['x-paystack-signature'], JSON.stringify(req.body))) return;

  if (req.body.event === 'charge.success') {
    const ref = req.body.data.reference;
    const sub = await Subscription.findOne({ reference: ref, status: 'pending' });
    if (!sub) return;

    const session = await AcademicSession.findById(sub.sessionId);
    sub.status = 'active';
    sub.paidAt = new Date();
    sub.expiresAt = session?.endDate || new Date(Date.now() + 120 * 24 * 3600 * 1000);
    sub.smsQuota = SMS_QUOTA_PER_TERM;
    sub.metadata = req.body.data;
    await sub.save();

    const school = await School.findById(sub.schoolId);
    await sendEmail({
      to: school.email,
      subject: `Subscription Activated - ${school.name}`,
      html: subscriptionConfirmed({
        schoolName: school.name,
        sessionName: session?.name || 'Current Term',
        reference: sub.reference,
        studentCount: sub.studentCount,
        totalAmount: sub.totalAmount.toLocaleString(),
        paidDate: new Date().toLocaleDateString(),
        expiresDate: new Date(sub.expiresAt).toLocaleDateString(),
      })
    });
  }
};

// ─── SaaS super-admin: list all schools + revenue ────────────────────────────
const saasOverview = catchAsync(async (req, res) => {
  // Only accessible with a special SAAS_ADMIN_KEY header
  const key = req.headers['x-saas-key'];
  if (key !== process.env.SAAS_ADMIN_KEY) throw new ApiError(403, 'Forbidden');

  const [schools, subs] = await Promise.all([
    School.find().lean(),
    Subscription.find({ status: 'active' }).populate('schoolId', 'name email').lean(),
  ]);

  const totalRevenue = subs.reduce((s, sub) => s + (sub.totalAmount || 0), 0);
  const activeSchools = new Set(subs.map(s => s.schoolId?._id?.toString())).size;

  return ok(res, {
    totalSchools: schools.length,
    activeSchools,
    totalRevenue,
    pricePerStudent: PRICE_PER_STUDENT,
    subscriptions: subs,
    schools,
  });
});

module.exports = { getSubscriptionStatus, initSubscription, verifySubscription, subscriptionWebhook, saasOverview };
