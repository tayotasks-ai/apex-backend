const { AcademicSession, Subscription, School } = require('../models');
const { ApiError } = require('../utils/helpers');

/**
 * Gates all protected school routes based on billing status.
 * - Passes if the school's billingRequired is false (billing not enforced)
 * - Passes if no current session exists (school is still setting up)
 * - Passes if current session has an active subscription
 * - Passes for setup routes so a school can fully configure before paying
 * - Blocks with 402 Payment Required if billing is enforced and no active subscription
 */

// These routes are always allowed — subscription NOT required
const ALWAYS_ALLOWED = [
  /^\/auth\//,
  /^\/admin\/billing/,
  /^\/webhooks\//,

  // Setup routes — accessible before subscription so school can configure fully
  /^\/admin\/sessions/,
  /^\/admin\/school/,
  /^\/admin\/dashboard/,
  /^\/admin\/subjects/,
  /^\/admin\/classes/,
  /^\/admin\/students/,
  /^\/admin\/users/,
  /^\/admin\/enrollments/,
  /^\/admin\/enroll/,
  /^\/admin\/calendar/,
];

const requireActiveSubscription = async (req, res, next) => {
  try {
    const path = req.path;

    // Always allow certain routes
    if (ALWAYS_ALLOWED.some(re => re.test(path))) return next();

    const schoolId = req.user?.schoolId;
    if (!schoolId) return next();

    // Check if this school even requires billing
    const school = await School.findById(schoolId).lean();
    if (!school?.billingRequired) return next();  // Billing not enforced → pass through

    const session = await AcademicSession.findOne({ schoolId, isCurrent: true }).lean();
    if (!session) return next(); // No session yet — school is still setting up

    const sub = await Subscription.findOne({ schoolId, sessionId: session._id }).lean();
    if (sub?.status === 'active') return next();

    // Block with a helpful 402 + metadata the frontend can use
    const priceInfo = school.pricePerStudent != null
      ? `Please pay ₦${school.pricePerStudent.toLocaleString()} per student to continue.`
      : 'Please contact the platform administrator for pricing.';

    const err = new ApiError(402,
      sub?.status === 'pending'
        ? 'Your payment is pending verification. Please verify your payment to activate your subscription.'
        : `Subscription required for "${session.name}". ${priceInfo}`
    );
    err.code = 'SUBSCRIPTION_REQUIRED';
    err.session = session.name;

    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: err.message,
      session: session.name,
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { requireActiveSubscription };
