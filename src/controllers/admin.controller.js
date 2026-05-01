const bcrypt = require('bcryptjs');
const genOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const { catchAsync, ok, created, ApiError, paginate, meta } = require('../utils/helpers');
const { sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/resend');
const { uploadBuffer } = require('../config/cloudinary');
const { School, User, Student, AcademicSession, Subject, Class, Enrollment, FeeStructure, Holiday, Notification, FeePayment } = require('../models');
const { inviteStaff, studentOnboarding, feeReminder } = require('../utils/emailTemplates');

// ── Helpers ───────────────────────────────────────────────────────────────────
const schoolId = req => req.user.schoolId;
const hash = pw => bcrypt.hash(pw, 12);
const tmpPw = () => Math.random().toString(36).slice(-8);

// ── Users ─────────────────────────────────────────────────────────────────────
const createUser = catchAsync(async (req, res) => {
  const { name, email, phone, role } = req.body;
  const otp = genOTP();
  const hashed = await hash(tmpPw());
  const user = await User.create({ schoolId: schoolId(req), name, email: email.toLowerCase(), phone, password: hashed, role, verificationToken: otp, isVerified: false });

  const school = await School.findById(schoolId(req));

  await sendEmail({
    to: user.email,
    subject: `Verification Code for ${school.name}`,
    html: inviteStaff({
      schoolName: school.name,
      name: user.name,
      role: user.role,
      otp: otp,
      verifyUrl: `${process.env.CLIENT_URL}/verify-email`
    })
  });

  return created(res, { _id: user._id, name, email, role }, 'User invited successfully');
});

const bulkCreateUsers = catchAsync(async (req, res) => {
  const { users } = req.body;
  const sid = schoolId(req);
  const school = await School.findById(sid);
  const results = [];
  for (const u of users) {
    try {
      if (!u.name || !u.email || !u.role) throw new Error('Missing required fields');
      const otp = genOTP();
      const hashed = await hash(tmpPw());
      const user = await User.create({ schoolId: sid, name: u.name, email: u.email.toLowerCase(), phone: u.phone, password: hashed, role: u.role, verificationToken: otp, isVerified: false });

      await sendEmail({
        to: user.email,
        subject: `Verification Code for ${school.name}`,
        html: inviteStaff({
          schoolName: school.name,
          name: user.name,
          role: user.role,
          otp: otp,
          verifyUrl: `${process.env.CLIENT_URL}/verify-email`
        })
      });

      results.push({ email: u.email, status: 'Success' });
    } catch (e) {
      results.push({ email: u.email, status: 'Failed', reason: e.message });
    }
  }
  return ok(res, results, 'Bulk creation completed');
});

const listUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { schoolId: schoolId(req), role: req.query.role };
  if (!req.query.role) delete filter.role;
  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ name: 1 }).skip(skip).limit(limit).populate('subjects', 'name code').lean(),
    User.countDocuments(filter),
  ]);
  return ok(res, users, 'OK', { meta: meta(page, limit, total) });
});

const updateUser = catchAsync(async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.id, schoolId: schoolId(req) }, req.body, { new: true }).select('-password').populate('subjects', 'name code');
  if (!user) throw new ApiError(404, 'User not found');
  return ok(res, user);
});

// ── Students ──────────────────────────────────────────────────────────────────
const createStudent = catchAsync(async (req, res) => {
  const { firstName, lastName, email, phone, gender, dob, admissionNo, parentId } = req.body;
  const plain = tmpPw();
  const hashed = await hash(plain);
  const student = await Student.create({
    schoolId: schoolId(req), firstName, lastName,
    email: email?.toLowerCase(), phone, gender, dob, admissionNo, parentId: parentId || null,
    password: hashed,
  });
  const school = await School.findById(schoolId(req));
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });

  if (email) {
    await sendEmail({
      to: email,
      subject: `Welcome to ${school.name}`,
      html: studentOnboarding({
        schoolName: school.name,
        studentName: `${firstName} ${lastName}`,
        className: 'Your Class', // Can be refined if class is known
        sessionName: session?.name || 'Current Session',
        studentEmail: email,
        tempPassword: plain,
        loginUrl: `${process.env.CLIENT_URL}/login`
      })
    });
  }

  return created(res, { ...student.toObject(), temporaryPassword: plain });
});

const bulkCreateStudents = catchAsync(async (req, res) => {
  const { students } = req.body;
  const sid = schoolId(req);
  const results = [];
  for (const s of students) {
    try {
      if (!s.firstName || !s.lastName) throw new Error('Missing required fields');
      const otp = genOTP();
      const hashed = await hash(tmpPw());
      await Student.create({
        schoolId: sid, firstName: s.firstName, lastName: s.lastName,
        email: s.email?.toLowerCase(), phone: s.phone, gender: s.gender, dob: s.dob, admissionNo: s.admissionNo,
        password: hashed, verificationToken: otp, isVerified: false
      });
      const school = await School.findById(sid);
      const session = await AcademicSession.findOne({ schoolId: sid, isCurrent: true });

      if (s.email) {
        await sendEmail({
          to: s.email,
          subject: `Welcome to ${school.name}`,
          html: studentOnboarding({
            schoolName: school.name,
            studentName: `${s.firstName} ${s.lastName}`,
            className: 'Your Class',
            sessionName: session?.name || 'Current Session',
            studentEmail: s.email,
            otp: otp,
            loginUrl: `${process.env.CLIENT_URL}/verify-email`
          })
        });
      }

      results.push({ email: s.email, admissionNo: s.admissionNo, status: 'Success', temporaryPassword: plain });
    } catch (e) {
      results.push({ email: s.email, admissionNo: s.admissionNo, status: 'Failed', reason: e.message });
    }
  }
  return ok(res, results, 'Bulk creation completed');
});

const listStudents = catchAsync(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { schoolId: schoolId(req) };
  if (req.query.search) {
    const re = new RegExp(req.query.search, 'i');
    filter.$or = [{ firstName: re }, { lastName: re }, { admissionNo: re }, { email: re }];
  }
  const [students, total] = await Promise.all([
    Student.find(filter).select('-password').sort({ firstName: 1 }).skip(skip).limit(limit).populate('parentId', 'name phone email').lean(),
    Student.countDocuments(filter),
  ]);
  return ok(res, students, 'OK', { meta: meta(page, limit, total) });
});

const updateStudent = catchAsync(async (req, res) => {
  const s = await Student.findOneAndUpdate({ _id: req.params.id, schoolId: schoolId(req) }, req.body, { new: true }).select('-password').populate('parentId', 'name phone email');
  if (!s) throw new ApiError(404, 'Student not found');
  return ok(res, s);
});

// ── Sessions ──────────────────────────────────────────────────────────────────
const createSession = catchAsync(async (req, res) => {
  const { name, startDate, endDate } = req.body;
  const session = await AcademicSession.create({ schoolId: schoolId(req), name, startDate, endDate });
  return created(res, session);
});

const listSessions = catchAsync(async (req, res) => {
  const sessions = await AcademicSession.find({ schoolId: schoolId(req) }).sort({ startDate: -1 }).lean();
  return ok(res, sessions);
});

const setCurrentSession = catchAsync(async (req, res) => {
  await AcademicSession.updateMany({ schoolId: schoolId(req) }, { isCurrent: false });
  const session = await AcademicSession.findOneAndUpdate({ _id: req.params.id, schoolId: schoolId(req) }, { isCurrent: true }, { new: true });
  if (!session) throw new ApiError(404, 'Session not found');
  return ok(res, session, 'Session set as current');
});

// ── Subjects ──────────────────────────────────────────────────────────────────
const createSubject = catchAsync(async (req, res) => {
  const { name, code } = req.body;
  const s = await Subject.create({ schoolId: schoolId(req), name, code });
  return created(res, s);
});

const bulkCreateSubjects = catchAsync(async (req, res) => {
  const { subjects } = req.body;
  const sid = schoolId(req);
  const results = [];
  for (const s of subjects) {
    try {
      if (!s.name) throw new Error('Missing name');
      await Subject.create({ schoolId: sid, name: s.name, code: s.code });
      results.push({ name: s.name, status: 'Success' });
    } catch (e) {
      results.push({ name: s.name, status: 'Failed', reason: e.message });
    }
  }
  return ok(res, results, 'Bulk creation completed');
});

const listSubjects = catchAsync(async (req, res) => {
  const subjects = await Subject.find({ schoolId: schoolId(req) }).sort({ name: 1 }).lean();
  return ok(res, subjects);
});

const deleteSubject = catchAsync(async (req, res) => {
  await Subject.findOneAndDelete({ _id: req.params.id, schoolId: schoolId(req) });
  return ok(res, null, 'Subject deleted');
});

// ── Classes ───────────────────────────────────────────────────────────────────
const createClass = catchAsync(async (req, res) => {
  const { name, classTeacher, subjects } = req.body;
  const cls = await Class.create({ schoolId: schoolId(req), name, classTeacher: classTeacher || null, subjects: subjects || [] });
  return created(res, cls);
});

const listClasses = catchAsync(async (req, res) => {
  const classes = await Class.find({ schoolId: schoolId(req) })
    .populate('classTeacher', 'name email')
    .populate('subjects.subjectId', 'name code')
    .populate('subjects.teacherId', 'name')
    .sort({ name: 1 }).lean();
  return ok(res, classes);
});

const updateClass = catchAsync(async (req, res) => {
  const cls = await Class.findOneAndUpdate({ _id: req.params.id, schoolId: schoolId(req) }, req.body, { new: true })
    .populate('classTeacher', 'name')
    .populate('subjects.subjectId', 'name')
    .populate('subjects.teacherId', 'name');
  if (!cls) throw new ApiError(404, 'Class not found');
  return ok(res, cls);
});

// ── Enrollment ────────────────────────────────────────────────────────────────
const enrollStudent = catchAsync(async (req, res) => {
  const { studentId, classId } = req.body;
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session. Set a current session first.');
  const enrollment = await Enrollment.create({ schoolId: schoolId(req), sessionId: session._id, classId, studentId });
  return created(res, enrollment, 'Student enrolled');
});

const listEnrollments = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const filter = { schoolId: schoolId(req), sessionId: session._id };
  if (req.query.classId) filter.classId = req.query.classId;
  const enrollments = await Enrollment.find(filter)
    .populate('studentId', 'firstName lastName admissionNo avatar')
    .populate('classId', 'name')
    .lean();
  return ok(res, enrollments);
});

// ── Fee Structure ──────────────────────────────────────────────────────────────
const setFeeStructure = catchAsync(async (req, res) => {
  const { classId, items, dueDate } = req.body;
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);
  const fee = await FeeStructure.findOneAndUpdate(
    { schoolId: schoolId(req), sessionId: session._id, classId: classId || null },
    { items, totalAmount: total, dueDate },
    { upsert: true, new: true }
  );
  return ok(res, fee, 'Fee structure saved');
});

const bulkSetFees = catchAsync(async (req, res) => {
  const { fees } = req.body;
  const sid = schoolId(req);
  const session = await AcademicSession.findOne({ schoolId: sid, isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');

  const classes = await Class.find({ schoolId: sid }).lean();
  const classMap = {};
  classes.forEach(c => classMap[c.name.toLowerCase()] = c._id);

  const grouped = {};
  for (const f of fees) {
    if (!f.label || !f.amount) continue;
    const cid = f.className ? classMap[f.className.trim().toLowerCase()] : null;
    const key = cid ? cid.toString() : 'school';
    if (!grouped[key]) grouped[key] = { classId: cid, items: [], dueDate: f.dueDate };
    grouped[key].items.push({ label: f.label.trim(), amount: Number(f.amount) || 0 });
    if (f.dueDate) grouped[key].dueDate = f.dueDate;
  }

  const results = [];
  for (const key in grouped) {
    const { classId, items, dueDate } = grouped[key];
    const total = items.reduce((s, i) => s + i.amount, 0);
    const fee = await FeeStructure.findOneAndUpdate(
      { schoolId: sid, sessionId: session._id, classId: classId || null },
      { items, totalAmount: total, dueDate },
      { upsert: true, new: true }
    );
    results.push(fee);
  }
  return ok(res, results, 'Fee structures imported successfully');
});

const listFeeStructures = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const fees = await FeeStructure.find({ schoolId: schoolId(req), sessionId: session._id })
    .populate('classId', 'name').lean();
  return ok(res, fees);
});

const sendFeeReminders = catchAsync(async (req, res) => {
  const sid = schoolId(req);
  const session = await AcademicSession.findOne({ schoolId: sid, isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');

  const school = await School.findById(sid);

  // Find all enrollments for current session
  const enrollments = await Enrollment.find({ schoolId: sid, sessionId: session._id })
    .populate('studentId')
    .populate('classId');

  let sentCount = 0;
  for (const e of enrollments) {
    const student = e.studentId;
    const cls = e.classId;
    if (!student.parentId) continue;

    // Get fee structure for this class (or general)
    const structure = await FeeStructure.findOne({
      schoolId: sid,
      sessionId: session._id,
      $or: [{ classId: cls._id }, { classId: null }]
    }).sort({ classId: -1 }); // specific class first

    if (!structure) continue;

    // Get total paid by student
    const payments = await FeePayment.find({
      schoolId: sid,
      sessionId: session._id,
      studentId: student._id,
      status: 'success'
    });
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const balance = structure.totalAmount - totalPaid;

    if (balance > 0) {
      const parent = await User.findById(student.parentId);
      if (parent?.email) {
        await sendEmail({
          to: parent.email,
          subject: `School Fees Reminder - ${student.firstName} ${student.lastName}`,
          html: feeReminder({
            schoolName: school.name,
            parentName: parent.name,
            studentName: `${student.firstName} ${student.lastName}`,
            className: cls.name,
            sessionName: session.name,
            dueDate: structure.dueDate ? new Date(structure.dueDate).toLocaleDateString() : 'Soon',
            tuitionAmount: structure.totalAmount.toLocaleString(),
            balanceAmount: balance.toLocaleString(),
            paymentUrl: `${process.env.CLIENT_URL}/parent/fees`,
            schoolEmail: school.email
          })
        });
        sentCount++;
      }
    }
  }

  return ok(res, { sentCount }, `Sent ${sentCount} reminders`);
});

// ── SMS Broadcast ─────────────────────────────────────────────────────────────
const sendBroadcast = catchAsync(async (req, res) => {
  const { message, audience } = req.body; // audience: 'parents' | 'teachers' | 'all'
  const roles = audience === 'parents' ? ['parent'] : audience === 'teachers' ? ['teacher'] : ['parent', 'teacher'];
  const users = await User.find({ schoolId: schoolId(req), role: { $in: roles }, phone: { $exists: true, $ne: '' } }).lean();
  const phones = users.map(u => u.phone).filter(Boolean);
  if (!phones.length) return ok(res, { sent: 0 }, 'No recipients with phone numbers');

  // Fire and forget – don't block the response
  sendSMS(phones, message).catch(e => console.error('[broadcast]', e));

  // Save as notification too
  await Notification.insertMany(users.map(u => ({
    schoolId: schoolId(req), recipientId: u._id,
    title: 'School Notification', body: message, type: 'broadcast',
  })));

  return ok(res, { sent: phones.length }, `SMS sent to ${phones.length} recipients`);
});

// ── Holidays / Calendar ───────────────────────────────────────────────────────
const createHoliday = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  const holiday = await Holiday.create({ ...req.body, schoolId: schoolId(req), sessionId: session._id });
  return created(res, holiday);
});

const listHolidays = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: schoolId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const events = await Holiday.find({ schoolId: schoolId(req), sessionId: session._id }).sort({ startDate: 1 }).lean();
  return ok(res, events);
});

const deleteHoliday = catchAsync(async (req, res) => {
  await Holiday.findOneAndDelete({ _id: req.params.id, schoolId: schoolId(req) });
  return ok(res, null, 'Event deleted');
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
const dashboardStats = catchAsync(async (req, res) => {
  const sid = schoolId(req);
  const session = await AcademicSession.findOne({ schoolId: sid, isCurrent: true }).lean();
  const [students, teachers, parents, enrollments] = await Promise.all([
    Student.countDocuments({ schoolId: sid }),
    User.countDocuments({ schoolId: sid, role: 'teacher' }),
    User.countDocuments({ schoolId: sid, role: 'parent' }),
    session ? Enrollment.countDocuments({ schoolId: sid, sessionId: session._id }) : Promise.resolve(0),
  ]);
  return ok(res, { students, teachers, parents, enrollments, session: session?.name || null });
});

// ── School profile ────────────────────────────────────────────────────────────
const getSchool = catchAsync(async (req, res) => {
  const school = await School.findById(schoolId(req)).lean();
  return ok(res, school);
});
const updateSchool = catchAsync(async (req, res) => {
  const school = await School.findByIdAndUpdate(schoolId(req), req.body, { new: true });
  return ok(res, school);
});

module.exports = {
  createUser, bulkCreateUsers, listUsers, updateUser,
  createStudent, bulkCreateStudents, listStudents, updateStudent,
  createSession, listSessions, setCurrentSession,
  createSubject, bulkCreateSubjects, listSubjects, deleteSubject,
  createClass, listClasses, updateClass,
  enrollStudent, listEnrollments,
  setFeeStructure, bulkSetFees, listFeeStructures,
  sendBroadcast,
  createHoliday, listHolidays, deleteHoliday,
  dashboardStats, getSchool, updateSchool,
  sendFeeReminders,
};
