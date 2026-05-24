const bcrypt = require('bcryptjs');
const { RootUser, School, User, Student, Subscription, AcademicSession } = require('../models');
const { catchAsync, ok, created, ApiError } = require('../utils/helpers');
const { signToken } = require('../utils/token');

// ── Setup (one-time seed, protected by env secret) ────────────────────────────
const setup = catchAsync(async (req, res) => {
  const secret = req.headers['x-root-secret'];
  if (!secret || secret !== process.env.ROOT_SECRET) {
    throw new ApiError(403, 'Forbidden');
  }
  const existing = await RootUser.findOne({});
  if (existing) throw new ApiError(409, 'Root user already exists');

  const { name, email, password } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'name, email and password are required');

  const hashed = await bcrypt.hash(password, 12);
  const root = await RootUser.create({ name, email: email.toLowerCase(), password: hashed });
  return created(res, { _id: root._id, name: root.name, email: root.email }, 'Root user created');
});

// ── Login ─────────────────────────────────────────────────────────────────────
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const root = await RootUser.findOne({ email: email.toLowerCase() }).select('+password');
  if (!root) throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, root.password);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  const token = signToken({ id: root._id, role: 'root' });
  return ok(res, {
    token,
    user: { _id: root._id, name: root.name, email: root.email, role: 'root' },
  });
});

// ── Platform dashboard ────────────────────────────────────────────────────────
const dashboard = catchAsync(async (req, res) => {
  const [
    totalSchools,
    activeSchools,
    totalStudents,
    totalTeachers,
    subscriptions,
  ] = await Promise.all([
    School.countDocuments({}),
    School.countDocuments({ isActive: true }),
    Student.countDocuments({}),
    User.countDocuments({ role: 'teacher' }),
    Subscription.find({ status: 'active' }).lean(),
  ]);

  const totalRevenue = subscriptions.reduce((s, sub) => s + (sub.totalAmount || 0), 0);
  const activeSubscriptions = subscriptions.length;

  // Schools by plan
  const planCounts = await School.aggregate([
    { $group: { _id: '$plan', count: { $sum: 1 } } },
  ]);

  // Recent schools (last 5)
  const recentSchools = await School.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name email plan isActive createdAt')
    .lean();

  return ok(res, {
    totalSchools,
    activeSchools,
    totalStudents,
    totalTeachers,
    totalRevenue,
    activeSubscriptions,
    planCounts,
    recentSchools,
  });
});

// ── List all schools ──────────────────────────────────────────────────────────
const listSchools = catchAsync(async (req, res) => {
  const { search, plan, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  if (plan) filter.plan = plan;

  const skip = (Number(page) - 1) * Number(limit);
  const [schools, total] = await Promise.all([
    School.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('+billingRequired +pricePerStudent +billingSetAt').lean(),
    School.countDocuments(filter),
  ]);

  // Attach quick stats per school
  const schoolIds = schools.map(s => s._id);
  const [studentCounts, teacherCounts, activeSubs] = await Promise.all([
    Student.aggregate([{ $match: { schoolId: { $in: schoolIds } } }, { $group: { _id: '$schoolId', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { schoolId: { $in: schoolIds }, role: 'teacher' } }, { $group: { _id: '$schoolId', count: { $sum: 1 } } }]),
    Subscription.find({ schoolId: { $in: schoolIds }, status: 'active' }).lean(),
  ]);

  const studentMap = Object.fromEntries(studentCounts.map(x => [x._id.toString(), x.count]));
  const teacherMap = Object.fromEntries(teacherCounts.map(x => [x._id.toString(), x.count]));
  const subMap     = Object.fromEntries(activeSubs.map(x => [x.schoolId.toString(), x]));

  const enriched = schools.map(s => ({
    ...s,
    studentCount:  studentMap[s._id.toString()] || 0,
    teacherCount:  teacherMap[s._id.toString()] || 0,
    subscription:  subMap[s._id.toString()] || null,
  }));

  return ok(res, enriched, 'OK', { meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

// ── Single school detail ──────────────────────────────────────────────────────
const getSchool = catchAsync(async (req, res) => {
  const school = await School.findById(req.params.id).lean();
  if (!school) throw new ApiError(404, 'School not found');

  const [students, teachers, sessions, subscriptions] = await Promise.all([
    Student.countDocuments({ schoolId: school._id }),
    User.countDocuments({ schoolId: school._id, role: 'teacher' }),
    AcademicSession.find({ schoolId: school._id }).sort({ createdAt: -1 }).limit(6).lean(),
    Subscription.find({ schoolId: school._id }).sort({ createdAt: -1 }).limit(4).lean(),
  ]);

  return ok(res, { ...school, studentCount: students, teacherCount: teachers, sessions, subscriptions });
});

// ── Update school plan / active status ───────────────────────────────────────
const updateSchool = catchAsync(async (req, res) => {
  const { plan, isActive, pricePerStudent, billingRequired } = req.body;
  const update = {};
  if (plan !== undefined) update.plan = plan;
  if (isActive !== undefined) update.isActive = isActive;
  if (pricePerStudent !== undefined) {
    update.pricePerStudent = pricePerStudent;
    update.billingSetBy = req.user.id;
    update.billingSetAt = new Date();
  }
  if (billingRequired !== undefined) {
    // Cannot enable billing without pricing set
    if (billingRequired === true) {
      const school = await School.findById(req.params.id).lean();
      const effectivePrice = pricePerStudent !== undefined ? pricePerStudent : school?.pricePerStudent;
      if (effectivePrice == null) {
        throw new ApiError(400, 'Cannot enable billing — pricePerStudent must be set first.');
      }
    }
    update.billingRequired = billingRequired;
  }

  const school = await School.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!school) throw new ApiError(404, 'School not found');
  return ok(res, school, 'School updated');
});

// ── Set school pricing (root sets negotiated price per student) ──────────────
const setSchoolPricing = catchAsync(async (req, res) => {
  const { pricePerStudent } = req.body;
  if (pricePerStudent == null || typeof pricePerStudent !== 'number' || pricePerStudent < 0) {
    throw new ApiError(400, 'pricePerStudent must be a non-negative number');
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    {
      pricePerStudent,
      billingSetBy: req.user.id,
      billingSetAt: new Date(),
    },
    { new: true }
  );
  if (!school) throw new ApiError(404, 'School not found');
  return ok(res, school, `Pricing set to ₦${pricePerStudent.toLocaleString()} per student`);
});

// ── Toggle billing requirement for a school ──────────────────────────────────
const triggerBilling = catchAsync(async (req, res) => {
  const { billingRequired } = req.body;
  if (typeof billingRequired !== 'boolean') {
    throw new ApiError(400, 'billingRequired must be a boolean');
  }

  const school = await School.findById(req.params.id);
  if (!school) throw new ApiError(404, 'School not found');

  // Cannot enable billing without pricing configured
  if (billingRequired && school.pricePerStudent == null) {
    throw new ApiError(400, 'Cannot enable billing — pricePerStudent must be set first. Set pricing before enabling billing.');
  }

  school.billingRequired = billingRequired;
  await school.save();

  return ok(res, school, billingRequired
    ? `Billing enabled for ${school.name}. School must pay to access guarded features.`
    : `Billing waived for ${school.name}. School can access all features freely.`
  );
});

module.exports = { setup, login, dashboard, listSchools, getSchool, updateSchool, setSchoolPricing, triggerBilling };
