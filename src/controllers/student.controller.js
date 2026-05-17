const {
  Enrollment, Assessment, Result, Quiz, QuizSubmission,
  Assignment, AssignmentSubmission, Note, TimetableEntry,
  Attendance, AcademicSession, Class, StudentRemark, TermSummary,
} = require('../models');
const { catchAsync, ok, created, ApiError, uploadBuffer } = require('../utils/helpers');
const cloudinary = require('../config/cloudinary');

const sId = req => req.user.schoolId;
const uId = req => req.user.id;

// ── My profile / enrollment ───────────────────────────────────────────────────
const myEnrollment = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, null);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id })
    .populate('classId', 'name subjects')
    .lean();
  return ok(res, enrollment);
});

// ── Timetable ─────────────────────────────────────────────────────────────────
const myTimetable = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, []);
  const entries = await TimetableEntry.find({ schoolId: sId(req), sessionId: session._id, classId: enrollment.classId })
    .populate('subjectId', 'name').populate('teacherId', 'name')
    .sort({ day: 1, startTime: 1 }).lean();
  return ok(res, entries);
});

// ── Assessments & results ─────────────────────────────────────────────────────
const myResults = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, []);

  const assessments = await Assessment.find({
    schoolId: sId(req), classId: enrollment.classId, sessionId: session._id, isReleased: true,
  }).populate('subjectId', 'name code').lean();

  const results = await Result.find({
    studentId: uId(req),
    assessmentId: { $in: assessments.map(a => a._id) },
  }).lean();

  const resultMap = {};
  results.forEach(r => { resultMap[r.assessmentId.toString()] = r; });

  const bySubject = {};
  assessments.forEach(a => {
    const key = a.subjectId?._id?.toString();
    if (!bySubject[key]) bySubject[key] = { subject: a.subjectId, assessments: [] };
    bySubject[key].assessments.push({ ...a, result: resultMap[a._id.toString()] || null });
  });

  return ok(res, Object.values(bySubject));
});

// ── Quizzes ───────────────────────────────────────────────────────────────────
const myQuizzes = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, []);

  const quizzes = await Quiz.find({
    schoolId: sId(req), classId: enrollment.classId, isOpen: true,
  }).select('-questions.answer').populate('subjectId', 'name').lean();

  const submissions = await QuizSubmission.find({
    studentId: uId(req), quizId: { $in: quizzes.map(q => q._id) },
  }).lean();
  const submittedMap = {};
  submissions.forEach(s => { submittedMap[s.quizId.toString()] = s; });

  return ok(res, quizzes.map(q => ({ ...q, submission: submittedMap[q._id.toString()] || null })));
});

const submitQuiz = catchAsync(async (req, res) => {
  const { quizId, answers } = req.body;
  const quiz = await Quiz.findOne({ _id: quizId, schoolId: sId(req), isOpen: true });
  if (!quiz) throw new ApiError(404, 'Quiz not found or not open');

  const existing = await QuizSubmission.findOne({ quizId, studentId: uId(req) });
  if (existing) throw new ApiError(409, 'Already submitted');

  let score = 0;
  quiz.questions.forEach((q, i) => {
    if (answers[i] === q.answer) score += q.points;
  });
  const total = quiz.questions.reduce((s, q) => s + q.points, 0);

  const sub = await QuizSubmission.create({ quizId, studentId: uId(req), answers, score, total });

  // If it's an assessment, record a result
  if (quiz.isAssessment && quiz.assessmentId) {
    const p = total > 0 ? (score / total) * 100 : 0;
    const grade = p >= 70 ? 'A' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 45 ? 'D' : p >= 40 ? 'E' : 'F';
    await Result.findOneAndUpdate(
      { assessmentId: quiz.assessmentId, studentId: uId(req) },
      { score, percentage: p, grade, schoolId: sId(req) },
      { upsert: true }
    );
  }

  return created(res, sub, `Quiz submitted! Score: ${score}/${total}`);
});

// ── Assignments ───────────────────────────────────────────────────────────────
const myAssignments = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, []);
  const assignments = await Assignment.find({ schoolId: sId(req), classId: enrollment.classId })
    .populate('subjectId', 'name').sort({ createdAt: -1 }).lean();
  const submissions = await AssignmentSubmission.find({
    studentId: uId(req), assignmentId: { $in: assignments.map(a => a._id) },
  }).lean();
  const subMap = {};
  submissions.forEach(s => { subMap[s.assignmentId.toString()] = s; });
  return ok(res, assignments.map(a => ({ ...a, submission: subMap[a._id.toString()] || null })));
});

const submitAssignment = catchAsync(async (req, res) => {
  const { assignmentId, note } = req.body;
  const existing = await AssignmentSubmission.findOne({ assignmentId, studentId: uId(req) });
  if (existing) throw new ApiError(409, 'Already submitted');
  let fileUrl;
  if (req.files?.file) {
    const r = await cloudinary.uploadBuffer(req.files.file.data, 'submissions');
    fileUrl = r.secure_url;
  }
  const sub = await AssignmentSubmission.create({ assignmentId, studentId: uId(req), fileUrl, note });
  return created(res, sub, 'Assignment submitted');
});

// ── Notes ─────────────────────────────────────────────────────────────────────
const myNotes = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, []);
  const filter = { schoolId: sId(req), classId: enrollment.classId };
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  const notes = await Note.find(filter)
    .populate('subjectId', 'name').populate('uploadedBy', 'name').sort({ createdAt: -1 }).lean();
  return ok(res, notes);
});

// ── Attendance ────────────────────────────────────────────────────────────────
const myAttendance = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const records = await Attendance.find({
    schoolId: sId(req), sessionId: session._id, 'records.studentId': uId(req),
  }).populate('subjectId', 'name').sort({ date: -1 }).lean();
  const mine = records.map(att => ({
    ...att,
    records: att.records.filter(r => r.studentId?.toString() === uId(req)),
  }));
  return ok(res, mine);
});

// ── Subjects (compulsory + elective selection) ────────────────────────────────
const mySubjects = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, { compulsory: [], availableElectives: [], selectedElectives: [], maxElectives: 0, hasSelected: false });

  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) return ok(res, { compulsory: [], availableElectives: [], selectedElectives: [], maxElectives: 0, hasSelected: false });

  const cls = await Class.findById(enrollment.classId)
    .populate('subjects.subjectId', 'name code')
    .populate('subjects.teacherId', 'name')
    .lean();
  if (!cls) return ok(res, { compulsory: [], availableElectives: [], selectedElectives: [], maxElectives: 0, hasSelected: false });

  const selectedIds = new Set((enrollment.electiveSubjectIds || []).map(id => id.toString()));
  const compulsory = [], availableElectives = [], selectedElectives = [];

  for (const s of cls.subjects) {
    const entry = {
      _id: s.subjectId?._id,
      name: s.subjectId?.name,
      code: s.subjectId?.code,
      teacher: s.teacherId?.name || null,
    };
    if (s.isCompulsory !== false) {
      compulsory.push(entry);
    } else {
      const isSelected = selectedIds.has(s.subjectId?._id?.toString());
      availableElectives.push({ ...entry, isSelected });
      if (isSelected) selectedElectives.push(entry);
    }
  }

  return ok(res, {
    compulsory,
    availableElectives,
    selectedElectives,
    maxElectives: cls.maxElectives || 0,
    hasSelected: enrollment.electiveSubjectIds?.length > 0,
  });
});

const selectElectives = catchAsync(async (req, res) => {
  const { electiveSubjectIds } = req.body;
  if (!Array.isArray(electiveSubjectIds)) throw new ApiError(400, 'electiveSubjectIds must be an array');

  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');

  const enrollment = await Enrollment.findOne({ studentId: uId(req), sessionId: session._id });
  if (!enrollment) throw new ApiError(404, 'Not enrolled in any class');

  const cls = await Class.findById(enrollment.classId).lean();
  if (!cls) throw new ApiError(404, 'Class not found');

  const validElectiveIds = cls.subjects
    .filter(s => s.isCompulsory === false)
    .map(s => s.subjectId.toString());

  for (const id of electiveSubjectIds) {
    if (!validElectiveIds.includes(id.toString())) {
      throw new ApiError(400, 'One or more selected subjects are not valid electives for your class');
    }
  }

  if (cls.maxElectives > 0 && electiveSubjectIds.length > cls.maxElectives) {
    throw new ApiError(400, `You can only select up to ${cls.maxElectives} elective subject${cls.maxElectives !== 1 ? 's' : ''}`);
  }

  enrollment.electiveSubjectIds = electiveSubjectIds;
  await enrollment.save();

  return ok(res, { electiveSubjectIds: enrollment.electiveSubjectIds }, 'Electives saved successfully');
});

// ── Remarks ───────────────────────────────────────────────────────────────────
const myRemarks = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const remarks = await StudentRemark.find({ schoolId: sId(req), sessionId: session._id, studentId: uId(req) })
    .populate('teacherId', 'name')
    .sort({ createdAt: -1 }).lean();
  return ok(res, remarks);
});

// ── Report card ───────────────────────────────────────────────────────────────
const myReport = catchAsync(async (req, res) => {
  const { sessionId } = req.query;
  const filter = { schoolId: sId(req), studentId: uId(req) };
  let session;
  if (sessionId) {
    session = await AcademicSession.findById(sessionId).lean();
    filter.sessionId = sessionId;
  } else {
    session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true }).lean();
    if (session) filter.sessionId = session._id;
  }
  if (!session?.resultsReleased) return ok(res, null, 'Results not yet released');

  const report = await TermSummary.findOne(filter)
    .populate('studentId', 'firstName lastName admissionNo gender avatar')
    .populate('classId', 'name')
    .populate('sessionId', 'name academicYear termNumber')
    .lean();
  if (!report) return ok(res, null, 'Report not yet generated');
  return ok(res, report);
});

const myReleasedSessions = catchAsync(async (req, res) => {
  const sessions = await AcademicSession.find({ schoolId: sId(req), resultsReleased: true })
    .sort({ createdAt: -1 }).lean();
  return ok(res, sessions);
});

const myAnnualReport = catchAsync(async (req, res) => {
  const { academicYear } = req.query;
  if (!academicYear) throw new ApiError(400, 'academicYear is required');
  const reports = await TermSummary.find({ schoolId: sId(req), studentId: uId(req), academicYear })
    .populate('sessionId', 'name termNumber')
    .sort({ termNumber: 1 }).lean();
  return ok(res, reports);
});

module.exports = {
  myEnrollment, myTimetable, myResults,
  myQuizzes, submitQuiz,
  myAssignments, submitAssignment,
  myNotes, myAttendance,
  mySubjects, selectElectives,
  myRemarks, myReport, myAnnualReport, myReleasedSessions,
};
