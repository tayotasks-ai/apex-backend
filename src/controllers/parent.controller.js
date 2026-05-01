const { v4: uuid } = require('uuid');
const {
  Student, Enrollment, Result, Assessment, Attendance,
  AcademicSession, FeeStructure, FeePayment,
} = require('../models');
const { catchAsync, ok, created, ApiError, getGrade } = require('../utils/helpers');
const { initializePayment, verifyPayment } = require('../utils/paystack');

const sId = req => req.user.schoolId;
const uId = req => req.user.id;

// ── My children ───────────────────────────────────────────────────────────────
const myChildren = catchAsync(async (req, res) => {
  const children = await Student.find({ schoolId: sId(req), parentId: uId(req), isActive: true })
    .select('-password').lean();

  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true }).lean();
  if (!session) return ok(res, children.map(c => ({ ...c, enrollment: null })));

  const enrollments = await Enrollment.find({
    schoolId: sId(req), sessionId: session._id,
    studentId: { $in: children.map(c => c._id) },
  }).populate('classId', 'name').lean();

  const enrollMap = {};
  enrollments.forEach(e => { enrollMap[e.studentId.toString()] = e; });

  return ok(res, children.map(c => ({ ...c, enrollment: enrollMap[c._id.toString()] || null })));
});

// ── Child performance ─────────────────────────────────────────────────────────
const childPerformance = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const child = await Student.findOne({ _id: studentId, schoolId: sId(req), parentId: uId(req) });
  if (!child) throw new ApiError(403, 'Access denied');

  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, { assessments: [], attendance: [] });

  const enrollment = await Enrollment.findOne({ studentId, sessionId: session._id }).populate('classId', 'name');
  if (!enrollment) return ok(res, { assessments: [], attendance: [], enrollment: null });

  const assessments = await Assessment.find({
    schoolId: sId(req), classId: enrollment.classId._id, sessionId: session._id, isReleased: true,
  }).populate('subjectId', 'name').lean();

  const results = await Result.find({
    studentId, assessmentId: { $in: assessments.map(a => a._id) },
  }).lean();
  const rMap = {};
  results.forEach(r => { rMap[r.assessmentId.toString()] = r; });

  const attendance = await Attendance.find({
    schoolId: sId(req), sessionId: session._id, 'records.studentId': studentId,
  }).populate('subjectId', 'name').sort({ date: -1 }).lean();

  const myAttendance = attendance.map(att => ({
    date: att.date,
    subject: att.subjectId?.name || 'General',
    status: att.records.find(r => r.studentId?.toString() === studentId.toString())?.status,
  }));

  return ok(res, {
    student: child,
    enrollment,
    session: session.name,
    assessments: assessments.map(a => ({ ...a, result: rMap[a._id.toString()] || null })),
    attendance: myAttendance,
  });
});

// ── Fee status ────────────────────────────────────────────────────────────────
const childFeeStatus = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const child = await Student.findOne({ _id: studentId, schoolId: sId(req), parentId: uId(req) });
  if (!child) throw new ApiError(403, 'Access denied');

  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, { feeStructure: null, payments: [] });

  const enrollment = await Enrollment.findOne({ studentId, sessionId: session._id });
  const feeStructure = enrollment
    ? await FeeStructure.findOne({ schoolId: sId(req), sessionId: session._id, $or: [{ classId: enrollment.classId }, { classId: null }] })
    : null;

  const payments = await FeePayment.find({ studentId, sessionId: session._id }).sort({ createdAt: -1 }).lean();
  const totalPaid = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0);
  const totalDue  = feeStructure?.totalAmount || 0;

  return ok(res, { student: child, session: session.name, feeStructure, payments, totalPaid, totalDue, balance: totalDue - totalPaid });
});

// ── Initialize fee payment ────────────────────────────────────────────────────
const initFeePayment = catchAsync(async (req, res) => {
  const { studentId, amount } = req.body;
  const child = await Student.findOne({ _id: studentId, schoolId: sId(req), parentId: uId(req) });
  if (!child) throw new ApiError(403, 'Access denied');

  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');

  const reference = `APEX-${uuid().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  const parent = await require('../models').User.findById(uId(req));

  const paymentData = await initializePayment({
    email: parent.email,
    amount,
    reference,
    metadata: { studentId, parentId: uId(req), schoolId: sId(req), sessionId: session._id },
    callbackUrl: `${process.env.CLIENT_URL}/parent/fees?ref=${reference}`,
  });

  await FeePayment.create({
    schoolId: sId(req), sessionId: session._id, studentId, parentId: uId(req),
    amount, reference, status: 'pending',
  });

  return ok(res, { authorizationUrl: paymentData.authorization_url, reference });
});

// ── Verify payment ────────────────────────────────────────────────────────────
const verifyFeePayment = catchAsync(async (req, res) => {
  const { reference } = req.params;
  const payment = await FeePayment.findOne({ reference });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'success') return ok(res, payment, 'Already verified');

  const data = await verifyPayment(reference);
  if (data.status === 'success') {
    payment.status  = 'success';
    payment.channel = data.channel;
    payment.paidAt  = new Date(data.paid_at);
    payment.metadata = data;
    await payment.save();
    return ok(res, payment, 'Payment verified ✅');
  }
  return ok(res, { status: data.status }, 'Payment not yet successful');
});

// ── Paystack webhook ──────────────────────────────────────────────────────────
const paystackWebhook = async (req, res) => {
  res.sendStatus(200);
  const { verifySignature } = require('../utils/paystack');
  if (!verifySignature(req.headers['x-paystack-signature'], JSON.stringify(req.body))) return;
  if (req.body.event === 'charge.success') {
    const ref = req.body.data.reference;
    await FeePayment.findOneAndUpdate(
      { reference: ref, status: 'pending' },
      { status: 'success', paidAt: new Date(), channel: req.body.data.channel, metadata: req.body.data }
    );
  }
};

module.exports = { myChildren, childPerformance, childFeeStatus, initFeePayment, verifyFeePayment, paystackWebhook };
