const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const {
  School, User, Student,
} = require('../models');
const { signToken } = require('../utils/token');
const { ApiError, ok, created } = require('../utils/helpers');
const { catchAsync } = require('../utils/helpers');
const { rSet, rGet, rDel } = require('../config/redis');
const { sendEmail } = require('../utils/resend');
const { welcomeSchool } = require('../utils/emailTemplates');

// ─── Register school ──────────────────────────────────────────────────────────
const register = catchAsync(async (req, res) => {
  const { schoolName, schoolEmail, adminName, adminEmail, password } = req.body;

  const existing = await School.findOne({ email: schoolEmail.toLowerCase() });
  if (existing) throw new ApiError(409, 'School email already registered');

  const school = await School.create({ name: schoolName, email: schoolEmail.toLowerCase(), isActive: true });
  const hashed = await bcrypt.hash(password, 12);
  const admin  = await User.create({
    schoolId: school._id, name: adminName,
    email: adminEmail.toLowerCase(), password: hashed, role: 'admin',
  });

  const token = signToken({ id: admin._id, schoolId: school._id, role: 'admin' });
  
  await sendEmail({
    to: schoolEmail,
    subject: `Welcome to ApexSchool - ${schoolName}`,
    html: welcomeSchool({
      schoolName: school.name,
      loginUrl: `${process.env.CLIENT_URL}/login`
    })
  });

  return created(res, { token, user: { _id: admin._id, name: admin.name, email: admin.email, role: 'admin' }, school }, 'School registered');
});

// ─── Login (admin / teacher / parent) ────────────────────────────────────────
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const users = await User.find({ email: email.toLowerCase() }).select('+password').populate('schoolId');
  if (!users.length) throw new ApiError(401, 'Invalid credentials');

  const validUsers = [];
  for (const u of users) {
    if (await bcrypt.compare(password, u.password)) {
      validUsers.push(u);
    }
  }

  if (!validUsers.length) throw new ApiError(401, 'Invalid credentials');

  if (validUsers.length === 1) {
    const user = validUsers[0];
    const token = signToken({ id: user._id, schoolId: user.schoolId._id, role: user.role });
    return ok(res, { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, branchId: user.branchId }, school: user.schoolId });
  }

  const options = validUsers.map(u => ({
    userId: u._id,
    schoolId: u.schoolId._id,
    schoolName: u.schoolId.name,
    role: u.role
  }));

  return ok(res, { multiSchool: true, options }, 'Please select a school');
});

// ─── Student login ────────────────────────────────────────────────────────────
const studentLogin = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const student = await Student.findOne({ email: email.toLowerCase() }).select('+password');
  if (!student) throw new ApiError(401, 'Invalid credentials');
  const valid = await bcrypt.compare(password, student.password);
  if (!valid) throw new ApiError(401, 'Invalid credentials');
  if (!student.isActive) throw new ApiError(403, 'Account deactivated');

  const school = await School.findById(student.schoolId).lean();
  const token  = signToken({ id: student._id, schoolId: student.schoolId, role: 'student' });
  return ok(res, {
    token,
    user: { _id: student._id, name: `${student.firstName} ${student.lastName}`, email: student.email, role: 'student', avatar: student.avatar, branchId: student.branchId },
    school,
  });
});

const selectSchool = catchAsync(async (req, res) => {
  const { email, password, schoolId } = req.body;
  const user = await User.findOne({ email: email.toLowerCase(), schoolId }).select('+password').populate('schoolId');
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  const token = signToken({ id: user._id, schoolId: user.schoolId._id, role: user.role });
  return ok(res, { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, branchId: user.branchId }, school: user.schoolId });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) throw new ApiError(400, 'Email, verification code, and password are required');

  // 1. Try User model
  let account = await User.findOne({ email: email.toLowerCase(), verificationToken: token });
  let type = 'user';

  // 2. Try Student model
  if (!account) {
    account = await Student.findOne({ email: email.toLowerCase(), verificationToken: token });
    type = 'student';
  }

  if (!account) {
    // Check if email even exists
    const exists = await User.findOne({ email: email.toLowerCase() }) || await Student.findOne({ email: email.toLowerCase() });
    if (!exists) throw new ApiError(400, `No account found with email: ${email}. Please ensure you are using the correct email.`);
    throw new ApiError(400, 'Invalid or expired verification code. Please check your email and try again.');
  }

  const hashed = await bcrypt.hash(password, 12);
  account.password = hashed;
  account.isVerified = true;
  account.verificationToken = undefined;
  await account.save();

  const school = await School.findById(account.schoolId).lean();
  const authToken = signToken({ 
    id: account._id, 
    schoolId: account.schoolId, 
    role: type === 'student' ? 'student' : account.role 
  });

  return ok(res, { 
    token: authToken, 
    user: { 
      _id: account._id, 
      name: type === 'student' ? `${account.firstName} ${account.lastName}` : account.name, 
      email: account.email, 
      role: type === 'student' ? 'student' : account.role,
      branchId: account.branchId
    }, 
    school 
  }, 'Verification successful. Your password has been set.');
});

// ─── Me ──────────────────────────────────────────────────────────────────────
const me = catchAsync(async (req, res) => {
  const { id, role, schoolId } = req.user;
  if (role === 'student') {
    const s = await Student.findById(id).lean();
    return ok(res, { ...s, role: 'student' });
  }
  const u = await User.findById(id).lean();
  return ok(res, { ...u, role });
});

module.exports = { register, login, studentLogin, selectSchool, verifyEmail, me };
