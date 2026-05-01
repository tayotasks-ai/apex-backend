const {
  Attendance, Assessment, Result, Quiz, Assignment,
  AssignmentSubmission, Note, TimetableEntry,
  AcademicSession, Class, Enrollment,
} = require('../models');
const { catchAsync, ok, created, ApiError, getGrade, paginate, meta } = require('../utils/helpers');
const { sendEmail } = require('../utils/resend');
const { resultsReleased } = require('../utils/emailTemplates');
const { School, User } = require('../models');
const { uploadBuffer } = require('../config/cloudinary');

const sId = req => req.user.schoolId;
const uId = req => req.user.id;

// ── My classes ────────────────────────────────────────────────────────────────
const myClasses = catchAsync(async (req, res) => {
  const classes = await Class.find({
    schoolId: sId(req),
    $or: [{ classTeacher: uId(req) }, { 'subjects.teacherId': uId(req) }],
  }).populate('subjects.subjectId', 'name code').lean();
  return ok(res, classes);
});

// ── Attendance ────────────────────────────────────────────────────────────────
const markAttendance = catchAsync(async (req, res) => {
  const { classId, subjectId, date, records } = req.body;
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  const day = new Date(date); day.setUTCHours(0,0,0,0);
  const att = await Attendance.findOneAndUpdate(
    { schoolId: sId(req), classId, subjectId: subjectId || null, date: day },
    { records, sessionId: session._id, markedBy: uId(req) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return ok(res, att, 'Attendance saved');
});

const getAttendance = catchAsync(async (req, res) => {
  const { classId, date, subjectId } = req.query;
  const filter = { schoolId: sId(req), classId };
  if (date) { const d = new Date(date); d.setUTCHours(0,0,0,0); filter.date = d; }
  if (subjectId) filter.subjectId = subjectId;
  const records = await Attendance.find(filter)
    .populate('records.studentId', 'firstName lastName admissionNo')
    .populate('subjectId', 'name')
    .sort({ date: -1 }).lean();
  return ok(res, records);
});

// ── Assessments ───────────────────────────────────────────────────────────────
const createAssessment = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  const a = await Assessment.create({ ...req.body, schoolId: sId(req), sessionId: session._id, createdBy: uId(req) });
  return created(res, a);
});

const myAssessments = catchAsync(async (req, res) => {
  const filter = { schoolId: sId(req), createdBy: uId(req) };
  if (req.query.classId) filter.classId = req.query.classId;
  const assessments = await Assessment.find(filter)
    .populate('subjectId', 'name').populate('classId', 'name').sort({ createdAt: -1 }).lean();
  return ok(res, assessments);
});

const recordResults = catchAsync(async (req, res) => {
  const { assessmentId, results } = req.body;
  const assessment = await Assessment.findOne({ _id: assessmentId, schoolId: sId(req) });
  if (!assessment) throw new ApiError(404, 'Assessment not found');
  const saved = [];
  for (const { studentId, score, remark } of results) {
    const pct = Math.round((score / assessment.maxScore) * 100);
    const grade = getGrade(pct);
    const r = await Result.findOneAndUpdate(
      { assessmentId, studentId },
      { score, percentage: pct, grade, remark, schoolId: sId(req) },
      { upsert: true, new: true }
    );
    saved.push(r);
  }
  return ok(res, saved, 'Results recorded');
});

const releaseAssessment = catchAsync(async (req, res) => {
  const a = await Assessment.findOneAndUpdate(
    { _id: req.params.id, schoolId: sId(req), createdBy: uId(req) },
    { isReleased: true }, { new: true }
  ).populate('subjectId', 'name').populate('classId', 'name');
  
  if (!a) throw new ApiError(404, 'Assessment not found');

  // Find all results for this assessment
  const results = await Result.find({ assessmentId: a._id }).populate({
    path: 'studentId',
    populate: { path: 'parentId' }
  });

  const school = await School.findById(sId(req));
  const teacher = await User.findById(uId(req));

  // Send emails to parents
  for (const r of results) {
    const student = r.studentId;
    const parent = student.parentId;
    if (parent?.email) {
      await sendEmail({
        to: parent.email,
        subject: `Result Released: ${student.firstName}'s ${a.name}`,
        html: resultsReleased({
          studentName: `${student.firstName} ${student.lastName}`,
          parentName: parent.name,
          schoolName: school.name,
          className: a.classId.name,
          assessmentTitle: a.name,
          grade: r.grade,
          score: r.score,
          maxScore: a.maxScore,
          percentage: r.percentage,
          subjectName: a.subjectId.name,
          teacherRemark: r.remark || "Keep up the good work!",
          teacherName: teacher.name,
          portalUrl: `${process.env.CLIENT_URL}/login`
        })
      });
    }
  }

  return ok(res, a, 'Assessment released and parents notified');
});

// ── Quiz ──────────────────────────────────────────────────────────────────────
const createQuiz = catchAsync(async (req, res) => {
  const { isAssessment, type, ...quizData } = req.body;
  const sid = sId(req);
  const session = await AcademicSession.findOne({ schoolId: sid, isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');

  let assessmentId = null;
  if (isAssessment) {
    const totalPoints = quizData.questions.reduce((s, q) => s + (Number(q.points) || 1), 0);
    const assessment = await Assessment.create({
      schoolId: sid,
      sessionId: session._id,
      classId: quizData.classId,
      subjectId: quizData.subjectId,
      createdBy: uId(req),
      title: quizData.title,
      type: type || 'Test',
      maxScore: totalPoints,
    });
    assessmentId = assessment._id;
  }

  const quiz = await Quiz.create({
    ...quizData,
    isAssessment,
    assessmentId,
    schoolId: sid,
    sessionId: session._id,
    createdBy: uId(req)
  });

  if (assessmentId) {
    await Assessment.findByIdAndUpdate(assessmentId, { quizId: quiz._id });
  }

  return created(res, quiz);
});

const myQuizzes = catchAsync(async (req, res) => {
  const quizzes = await Quiz.find({ schoolId: sId(req), createdBy: uId(req) })
    .populate('subjectId', 'name').populate('classId', 'name').sort({ createdAt: -1 }).lean();
  return ok(res, quizzes);
});

const toggleQuiz = catchAsync(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, schoolId: sId(req), createdBy: uId(req) });
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  quiz.isOpen = !quiz.isOpen;
  if (quiz.isOpen && req.body.duration) quiz.openUntil = new Date(Date.now() + req.body.duration * 60000);
  await quiz.save();
  return ok(res, quiz, quiz.isOpen ? 'Quiz opened' : 'Quiz closed');
});

const deleteQuiz = catchAsync(async (req, res) => {
  const { id } = req.params;
  const quiz = await Quiz.findOne({ _id: id, schoolId: sId(req), createdBy: uId(req) });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  // Cascade delete submissions
  await QuizSubmission.deleteMany({ quizId: id });

  // If it was linked to an assessment, delete results and assessment entry
  if (quiz.assessmentId) {
    await Result.deleteMany({ assessmentId: quiz.assessmentId });
    await Assessment.deleteOne({ _id: quiz.assessmentId });
  }

  await Quiz.deleteOne({ _id: id });
  return ok(res, null, 'Quiz and associated data deleted');
});

const quizSubmissions = catchAsync(async (req, res) => {
  const subs = await QuizSubmission.find({ quizId: req.params.id })
    .populate('studentId', 'firstName lastName admissionNo').lean();
  return ok(res, subs);
});

const updateQuizScore = catchAsync(async (req, res) => {
  const { submissionId, score } = req.body;
  const sub = await QuizSubmission.findById(submissionId).populate('quizId');
  if (!sub) throw new ApiError(404, 'Submission not found');
  
  sub.score = score;
  await sub.save();

  // If linked to assessment, update result
  if (sub.quizId.isAssessment && sub.quizId.assessmentId) {
    const p = sub.total > 0 ? (score / sub.total) * 100 : 0;
    const grade = getGrade(p);
    await Result.findOneAndUpdate(
      { assessmentId: sub.quizId.assessmentId, studentId: sub.studentId },
      { score, percentage: p, grade, schoolId: sId(req) },
      { upsert: true }
    );
  }

  return ok(res, sub, 'Score updated');
});

// ── Assignment ────────────────────────────────────────────────────────────────
const createAssignment = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  let fileUrl;
  if (req.files?.file) {
    const r = await uploadBuffer(req.files.file.data, 'assignments');
    fileUrl = r.secure_url;
  }
  const a = await Assignment.create({ ...req.body, schoolId: sId(req), sessionId: session._id, createdBy: uId(req), fileUrl });
  return created(res, a);
});

const deleteAssignment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const assignment = await Assignment.findOne({ _id: id, schoolId: sId(req), createdBy: uId(req) });
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  // Cascade delete submissions
  await AssignmentSubmission.deleteMany({ assignmentId: id });

  // If it was linked to an assessment, delete results and assessment entry
  const assessment = await Assessment.findOne({
    schoolId: sId(req),
    classId: assignment.classId,
    subjectId: assignment.subjectId,
    title: assignment.title
  });

  if (assessment) {
    await Result.deleteMany({ assessmentId: assessment._id });
    await Assessment.deleteOne({ _id: assessment._id });
  }

  await Assignment.deleteOne({ _id: id });
  return ok(res, null, 'Assignment and associated data deleted');
});

const myAssignments = catchAsync(async (req, res) => {
  const assignments = await Assignment.find({ schoolId: sId(req), createdBy: uId(req) })
    .populate('subjectId', 'name').populate('classId', 'name').sort({ createdAt: -1 }).lean();
  return ok(res, assignments);
});

const gradeSubmission = catchAsync(async (req, res) => {
  const { submissionId, score, grade, isAssessment, maxScore } = req.body;
  const sub = await AssignmentSubmission.findById(submissionId).populate('assignmentId');
  if (!sub) throw new ApiError(404, 'Submission not found');

  sub.score = score;
  sub.grade = grade;
  sub.gradedBy = uId(req);
  await sub.save();

  if (isAssessment) {
    const assignment = sub.assignmentId;
    let assessment = await Assessment.findOne({
      schoolId: sId(req),
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      title: assignment.title
    });

    if (!assessment) {
      const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
      assessment = await Assessment.create({
        schoolId: sId(req),
        sessionId: session._id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        createdBy: uId(req),
        title: assignment.title,
        type: 'Assignment',
        maxScore: maxScore || 100,
      });
    }

    const p = assessment.maxScore > 0 ? (score / assessment.maxScore) * 100 : 0;
    await Result.findOneAndUpdate(
      { assessmentId: assessment._id, studentId: sub.studentId },
      { score, percentage: p, grade, schoolId: sId(req) },
      { upsert: true }
    );
  }

  return ok(res, sub, 'Graded');
});

const assignmentSubmissions = catchAsync(async (req, res) => {
  const subs = await AssignmentSubmission.find({ assignmentId: req.params.id })
    .populate('studentId', 'firstName lastName admissionNo').lean();
  return ok(res, subs);
});

// ── Notes ─────────────────────────────────────────────────────────────────────
const uploadNote = catchAsync(async (req, res) => {
  if (!req.files?.file) throw new ApiError(400, 'No file uploaded');
  const { classId, subjectId, title } = req.body;
  const r = await uploadBuffer(req.files.file.data, 'notes');
  const note = await Note.create({
    schoolId: sId(req), classId, subjectId, title,
    fileUrl: r.secure_url, fileType: req.files.file.mimetype,
    uploadedBy: uId(req),
  });
  return created(res, note);
});

const listNotes = catchAsync(async (req, res) => {
  const filter = { schoolId: sId(req) };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  const notes = await Note.find(filter).populate('subjectId', 'name').populate('uploadedBy', 'name').sort({ createdAt: -1 }).lean();
  return ok(res, notes);
});

// ── Timetable ─────────────────────────────────────────────────────────────────
const upsertTimetable = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) throw new ApiError(400, 'No active session');
  const { classId, subjectId, teacherId, day, startTime, endTime } = req.body;
  const entry = await TimetableEntry.findOneAndUpdate(
    { schoolId: sId(req), sessionId: session._id, classId, day, startTime },
    { subjectId, teacherId, endTime },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return ok(res, entry);
});

const getTimetable = catchAsync(async (req, res) => {
  const session = await AcademicSession.findOne({ schoolId: sId(req), isCurrent: true });
  if (!session) return ok(res, []);
  const filter = { schoolId: sId(req), sessionId: session._id };
  if (req.query.classId) filter.classId = req.query.classId;
  const entries = await TimetableEntry.find(filter)
    .populate('subjectId', 'name').populate('teacherId', 'name')
    .sort({ day: 1, startTime: 1 }).lean();
  return ok(res, entries);
});

module.exports = {
  myClasses, markAttendance, getAttendance,
  createAssessment, myAssessments, recordResults, releaseAssessment,
  createQuiz, myQuizzes, toggleQuiz, deleteQuiz, quizSubmissions, updateQuizScore,
  createAssignment, myAssignments, deleteAssignment, gradeSubmission, assignmentSubmissions,
  uploadNote, listNotes,
  upsertTimetable, getTimetable,
};
