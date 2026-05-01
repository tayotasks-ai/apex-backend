const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware');
const { requireActiveSubscription } = require('../middleware/subscription');

const auth     = require('../controllers/auth.controller');
const admin    = require('../controllers/admin.controller');
const teacher  = require('../controllers/teacher.controller');
const student  = require('../controllers/student.controller');
const parent   = require('../controllers/parent.controller');
const billing  = require('../controllers/billing.controller');

const A = 'admin', T = 'teacher', P = 'parent', S = 'student';

// ── Auth (public) ─────────────────────────────────────────────────────────────
router.post('/auth/register',      auth.register);
router.post('/auth/login',         auth.login);
router.post('/auth/select-school', auth.selectSchool);
router.post('/auth/student-login', auth.studentLogin);
router.post('/auth/verify-email',  auth.verifyEmail);
router.get('/auth/me',             authenticate, auth.me);

// ── Billing (admin only — always accessible, subscription gate exempt) ─────────
const adm = [authenticate, authorize(A)];
router.get('/admin/billing',                  ...adm, billing.getSubscriptionStatus);
router.post('/admin/billing/subscribe',       ...adm, billing.initSubscription);
router.get('/admin/billing/verify/:reference',...adm, billing.verifySubscription);
router.post('/webhooks/subscription',         billing.subscriptionWebhook);
router.get('/saas/overview',                  billing.saasOverview); // super-admin

// ── Apply subscription gate to all remaining routes ───────────────────────────
router.use(authenticate, requireActiveSubscription);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/dashboard',             authorize(A), admin.dashboardStats);
router.get('/admin/school',                authorize(A), admin.getSchool);
router.patch('/admin/school',              authorize(A), admin.updateSchool);

router.post('/admin/users',               authorize(A), admin.createUser);
router.post('/admin/users/bulk',          authorize(A), admin.bulkCreateUsers);
router.get('/admin/users',                authorize(A), admin.listUsers);
router.patch('/admin/users/:id',          authorize(A), admin.updateUser);

router.post('/admin/students',            authorize(A), admin.createStudent);
router.post('/admin/students/bulk',       authorize(A), admin.bulkCreateStudents);
router.get('/admin/students',             authorize(A), admin.listStudents);
router.patch('/admin/students/:id',       authorize(A), admin.updateStudent);

router.post('/admin/sessions',            authorize(A), admin.createSession);
router.get('/admin/sessions',             authorize(A), admin.listSessions);
router.patch('/admin/sessions/:id/current', authorize(A), admin.setCurrentSession);

router.post('/admin/subjects',            authorize(A), admin.createSubject);
router.post('/admin/subjects/bulk',       authorize(A), admin.bulkCreateSubjects);
router.get('/admin/subjects',             authorize(A), admin.listSubjects);
router.delete('/admin/subjects/:id',      authorize(A), admin.deleteSubject);

router.post('/admin/classes',             authorize(A), admin.createClass);
router.get('/admin/classes',              authorize(A), admin.listClasses);
router.patch('/admin/classes/:id',        authorize(A), admin.updateClass);

router.post('/admin/enroll',              authorize(A), admin.enrollStudent);
router.get('/admin/enrollments',          authorize(T, A), admin.listEnrollments);

router.post('/admin/fees',                authorize(A), admin.setFeeStructure);
router.post('/admin/fees/bulk',           authorize(A), admin.bulkSetFees);
router.get('/admin/fees',                 authorize(A), admin.listFeeStructures);
router.post('/admin/fees/remind',         authorize(A), admin.sendFeeReminders);

router.post('/admin/broadcast',           authorize(A), admin.sendBroadcast);

router.post('/admin/calendar',            authorize(A), admin.createHoliday);
router.get('/admin/calendar',             admin.listHolidays);
router.delete('/admin/calendar/:id',      authorize(A), admin.deleteHoliday);

// ── Teacher ───────────────────────────────────────────────────────────────────
router.get('/teacher/classes',                authorize(T, A), teacher.myClasses);
router.post('/teacher/attendance',            authorize(T, A), teacher.markAttendance);
router.get('/teacher/attendance',             authorize(T, A), teacher.getAttendance);
router.post('/teacher/assessments',           authorize(T, A), teacher.createAssessment);
router.get('/teacher/assessments',            authorize(T, A), teacher.myAssessments);
router.post('/teacher/assessments/results',   authorize(T, A), teacher.recordResults);
router.patch('/teacher/assessments/:id/release', authorize(T, A), teacher.releaseAssessment);
router.post('/teacher/quizzes',               authorize(T, A), teacher.createQuiz);
router.get('/teacher/quizzes',                authorize(T, A), teacher.myQuizzes);
router.patch('/teacher/quizzes/:id/toggle',   authorize(T, A), teacher.toggleQuiz);
router.delete('/teacher/quizzes/:id',          authorize(T, A), teacher.deleteQuiz);
router.get('/teacher/quizzes/:id/submissions', authorize(T, A), teacher.quizSubmissions);
router.post('/teacher/quizzes/score',           authorize(T, A), teacher.updateQuizScore);
router.post('/teacher/assignments',           authorize(T, A), teacher.createAssignment);
router.get('/teacher/assignments',            authorize(T, A), teacher.myAssignments);
router.delete('/teacher/assignments/:id',         authorize(T, A), teacher.deleteAssignment);
router.get('/teacher/assignments/:id/submissions', authorize(T, A), teacher.assignmentSubmissions);
router.post('/teacher/assignments/grade',     authorize(T, A), teacher.gradeSubmission);
router.post('/teacher/notes',                 authorize(T, A), teacher.uploadNote);
router.get('/teacher/notes',                  authorize(T, A), teacher.listNotes);
router.post('/teacher/timetable',             authorize(T, A), teacher.upsertTimetable);
router.get('/teacher/timetable',              teacher.getTimetable);

// ── Student ───────────────────────────────────────────────────────────────────
router.get('/student/enrollment',          authorize(S), student.myEnrollment);
router.get('/student/timetable',           authorize(S), student.myTimetable);
router.get('/student/results',             authorize(S), student.myResults);
router.get('/student/attendance',          authorize(S), student.myAttendance);
router.get('/student/quizzes',             authorize(S), student.myQuizzes);
router.post('/student/quizzes/submit',     authorize(S), student.submitQuiz);
router.get('/student/assignments',         authorize(S), student.myAssignments);
router.post('/student/assignments/submit', authorize(S), student.submitAssignment);
router.get('/student/notes',               authorize(S), student.myNotes);

// ── Parent ────────────────────────────────────────────────────────────────────
router.get('/parent/children',                          authorize(P), parent.myChildren);
router.get('/parent/children/:studentId/performance',   authorize(P), parent.childPerformance);
router.get('/parent/children/:studentId/fees',          authorize(P), parent.childFeeStatus);
router.post('/parent/fees/pay',                         authorize(P), parent.initFeePayment);
router.get('/parent/fees/verify/:reference',            authorize(P), parent.verifyFeePayment);
router.post('/webhooks/paystack',                        parent.paystackWebhook);

module.exports = router;
