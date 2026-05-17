const {
  School, AcademicSession, Enrollment, Assessment, Result,
  Attendance, TermSummary, Student, Class,
} = require('../models');
const { catchAsync, ok, ApiError, getGrade } = require('../utils/helpers');

const sId = req => req.user.schoolId;

// ── Generate term report for all students in a session ────────────────────────
const generateReport = catchAsync(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) throw new ApiError(400, 'sessionId is required');

  const [session, school] = await Promise.all([
    AcademicSession.findOne({ _id: sessionId, schoolId: sId(req) }),
    School.findById(sId(req)).lean(),
  ]);
  if (!session) throw new ApiError(404, 'Session not found');

  const caMax   = school.caMax   || 40;
  const examMax = school.examMax || 60;

  // All enrollments for this session
  const enrollments = await Enrollment.find({ schoolId: sId(req), sessionId })
    .populate('studentId', 'firstName lastName admissionNo')
    .populate('classId', 'name')
    .lean();

  if (!enrollments.length) return ok(res, { generated: 0 }, 'No enrolled students found');

  // All released assessments for this school+session (fetched once)
  const assessments = await Assessment.find({ schoolId: sId(req), sessionId, isReleased: true })
    .populate('subjectId', 'name')
    .lean();

  const assessmentIds = assessments.map(a => a._id);

  // All results for those assessments (fetched once)
  const allResults = await Result.find({ assessmentId: { $in: assessmentIds } }).lean();
  const resultMap = {};
  for (const r of allResults) {
    resultMap[`${r.assessmentId}_${r.studentId}`] = r;
  }

  // All attendance records for this session (fetched once)
  const allAttendance = await Attendance.find({ schoolId: sId(req), sessionId }).lean();

  const summaries = [];

  for (const enrollment of enrollments) {
    const student = enrollment.studentId;
    const cls     = enrollment.classId;
    if (!student || !cls) continue;

    const classAssessments = assessments.filter(a => a.classId.toString() === cls._id.toString());

    // Group by subject
    const subjectMap = {};
    for (const a of classAssessments) {
      const key = a.subjectId._id.toString();
      if (!subjectMap[key]) {
        subjectMap[key] = { subjectId: a.subjectId._id, subjectName: a.subjectId.name, caItems: [], examItems: [] };
      }
      if (a.type === 'Exam') {
        subjectMap[key].examItems.push(a);
      } else {
        subjectMap[key].caItems.push(a);
      }
    }

    // Compute per-subject scores
    const subjectRows = [];
    for (const sub of Object.values(subjectMap)) {
      let caRaw = 0, caMaxRaw = 0;
      for (const a of sub.caItems) {
        const r = resultMap[`${a._id}_${student._id}`];
        if (r) { caRaw += r.score; caMaxRaw += a.maxScore; }
      }

      let examRaw = 0, examMaxRaw = 0;
      for (const a of sub.examItems) {
        const r = resultMap[`${a._id}_${student._id}`];
        if (r) { examRaw += r.score; examMaxRaw += a.maxScore; }
      }

      const caScore   = caMaxRaw   > 0 ? Math.round((caRaw   / caMaxRaw)   * caMax)   : 0;
      const examScore = examMaxRaw > 0 ? Math.round((examRaw / examMaxRaw) * examMax) : 0;

      let total;
      if (sub.examItems.length === 0) {
        // No exam — prorate CA to 100
        total = caMaxRaw > 0 ? Math.round((caRaw / caMaxRaw) * 100) : 0;
      } else {
        total = caScore + examScore;
      }

      subjectRows.push({
        subjectId:   sub.subjectId,
        subjectName: sub.subjectName,
        caScore,
        examScore,
        total,
        grade: getGrade(total),
      });
    }

    const totalScore = subjectRows.reduce((s, r) => s + r.total, 0);
    const average    = subjectRows.length > 0 ? Math.round(totalScore / subjectRows.length) : 0;

    // Attendance for this student in this class
    const classAtt = allAttendance.filter(a => a.classId.toString() === cls._id.toString());
    let present = 0, attTotal = 0;
    for (const att of classAtt) {
      for (const rec of att.records) {
        if (rec.studentId.toString() === student._id.toString()) {
          attTotal++;
          if (rec.status === 'Present') present++;
        }
      }
    }

    const summary = await TermSummary.findOneAndUpdate(
      { schoolId: sId(req), sessionId, studentId: student._id },
      {
        classId:      cls._id,
        academicYear: session.academicYear,
        termNumber:   session.termNumber,
        subjects:     subjectRows,
        totalScore,
        average,
        attendance:   { present, total: attTotal },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    summaries.push(summary);
  }

  // Assign positions within each class (by totalScore descending)
  const classBuckets = {};
  for (const s of summaries) {
    const ck = s.classId.toString();
    if (!classBuckets[ck]) classBuckets[ck] = [];
    classBuckets[ck].push(s);
  }

  for (const bucket of Object.values(classBuckets)) {
    bucket.sort((a, b) => b.totalScore - a.totalScore);
    await Promise.all(
      bucket.map((s, i) =>
        TermSummary.findByIdAndUpdate(s._id, { positionInClass: i + 1, classSize: bucket.length })
      )
    );
  }

  return ok(res, { generated: summaries.length }, `Reports generated for ${summaries.length} students`);
});

// ── Get single student term report ────────────────────────────────────────────
const getStudentReport = catchAsync(async (req, res) => {
  const { sessionId } = req.query;
  const filter = { schoolId: sId(req), studentId: req.params.studentId };
  if (sessionId) filter.sessionId = sessionId;

  const report = await TermSummary.findOne(filter)
    .populate('studentId', 'firstName lastName admissionNo gender avatar')
    .populate('classId', 'name classTeacher')
    .populate('sessionId', 'name academicYear termNumber')
    .lean();

  if (!report) throw new ApiError(404, 'Report not generated yet for this student/session');
  return ok(res, report);
});

// ── Get all reports for a session (admin list view) ───────────────────────────
const getSessionReports = catchAsync(async (req, res) => {
  const { sessionId, classId } = req.query;
  if (!sessionId) throw new ApiError(400, 'sessionId is required');

  const filter = { schoolId: sId(req), sessionId };
  if (classId) filter.classId = classId;

  const reports = await TermSummary.find(filter)
    .populate('studentId', 'firstName lastName admissionNo')
    .populate('classId', 'name')
    .sort({ positionInClass: 1 })
    .lean();

  return ok(res, reports);
});

// ── Annual (3-term) cumulative report for a student ───────────────────────────
const getAnnualReport = catchAsync(async (req, res) => {
  const { academicYear } = req.query;
  if (!academicYear) throw new ApiError(400, 'academicYear is required');

  const reports = await TermSummary.find({
    schoolId:     sId(req),
    studentId:    req.params.studentId,
    academicYear,
  })
    .populate('studentId', 'firstName lastName admissionNo gender')
    .populate('classId', 'name')
    .populate('sessionId', 'name termNumber')
    .sort({ termNumber: 1 })
    .lean();

  if (!reports.length) throw new ApiError(404, 'No reports found for this academic year');

  // Aggregate across terms per subject
  const subjectTotals = {};
  for (const report of reports) {
    for (const sub of report.subjects) {
      const key = sub.subjectId.toString();
      if (!subjectTotals[key]) subjectTotals[key] = { subjectName: sub.subjectName, totals: [], grades: [] };
      subjectTotals[key].totals.push(sub.total);
      subjectTotals[key].grades.push(sub.grade);
    }
  }

  const cumulativeSubjects = Object.entries(subjectTotals).map(([, sub]) => ({
    subjectName:   sub.subjectName,
    termTotals:    sub.totals,
    cumulativeAvg: Math.round(sub.totals.reduce((s, v) => s + v, 0) / sub.totals.length),
    grade:         getGrade(Math.round(sub.totals.reduce((s, v) => s + v, 0) / sub.totals.length)),
  }));

  const overallAvg = cumulativeSubjects.length
    ? Math.round(cumulativeSubjects.reduce((s, s2) => s + s2.cumulativeAvg, 0) / cumulativeSubjects.length)
    : 0;

  return ok(res, {
    student:            reports[0].studentId,
    academicYear,
    terms:              reports,
    cumulativeSubjects,
    overallAverage:     overallAvg,
    overallGrade:       getGrade(overallAvg),
  });
});

// ── Update classTeacher / principal remarks on a term report ──────────────────
const updateRemarks = catchAsync(async (req, res) => {
  const { classTeacherRemark, principalRemark } = req.body;
  const report = await TermSummary.findOneAndUpdate(
    { _id: req.params.id, schoolId: sId(req) },
    { classTeacherRemark, principalRemark },
    { new: true }
  );
  if (!report) throw new ApiError(404, 'Report not found');
  return ok(res, report, 'Remarks updated');
});

module.exports = { generateReport, getStudentReport, getSessionReports, getAnnualReport, updateRemarks };
