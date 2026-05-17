const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── School ────────────────────────────────────────────────────────────────────
const SchoolSchema = new Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  phone:     { type: String },
  address:   { type: String },
  logo:      { type: String },
  isActive:  { type: Boolean, default: false },
  plan:      { type: String, enum: ['trial', 'basic', 'pro'], default: 'trial' },
  termiiSenderId: { type: String, default: 'ApexSchool' },
  caMax:     { type: Number, default: 40 },
  examMax:   { type: Number, default: 60 },
  // Paystack split – set when admin saves bank account
  bankAccount: {
    accountNumber:        { type: String },
    bankCode:             { type: String },
    bankName:             { type: String },
    accountName:          { type: String },
    paystackSubaccountId: { type: String },   // subaccount ID
    paystackSubaccountCode: { type: String }, // e.g. ACCT_xxxxx (used in payment init)
    settlementBank:       { type: String },   // bank code for paystack
  },
}, { timestamps: true });

// ── User  (admin | teacher | parent) ─────────────────────────────────────────
const UserSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, lowercase: true },
  phone:    { type: String },
  password: { type: String, required: true, select: false },
  role:     { type: String, enum: ['admin', 'teacher', 'parent'], required: true },
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  avatar:   { type: String },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
}, { timestamps: true });
UserSchema.index({ email: 1, schoolId: 1 }, { unique: true });

// ── Student ───────────────────────────────────────────────────────────────────
const StudentSchema = new Schema({
  schoolId:    { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  email:       { type: String, lowercase: true, sparse: true },
  phone:       { type: String },
  password:    { type: String, select: false },
  gender:      { type: String, enum: ['Male', 'Female', 'Other'] },
  dob:         { type: Date },
  admissionNo: { type: String },
  avatar:      { type: String },
  parentId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
  isActive:    { type: Boolean, default: true },
  isVerified:  { type: Boolean, default: false },
  verificationToken: { type: String },
}, { timestamps: true });
StudentSchema.index({ admissionNo: 1, schoolId: 1 }, { unique: true, sparse: true });
StudentSchema.index({ email: 1 }, { unique: true, sparse: true });

// ── AcademicSession ───────────────────────────────────────────────────────────
const SessionSchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  name:         { type: String, required: true },   // "2025/2026 First Term" (auto-generated)
  academicYear: { type: String, required: true },   // "2025/2026"
  termNumber:   { type: Number, enum: [1, 2, 3], required: true },  // 1=First, 2=Second, 3=Third
  startDate:    { type: Date, required: true },
  endDate:      { type: Date, required: true },
  isCurrent:       { type: Boolean, default: false },
  resultsReleased: { type: Boolean, default: false },
}, { timestamps: true });
SessionSchema.index({ schoolId: 1, name: 1 }, { unique: true });
SessionSchema.index({ schoolId: 1, academicYear: 1, termNumber: 1 }, { unique: true });

// ── Subject ───────────────────────────────────────────────────────────────────
const SubjectSchema = new Schema({
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
  name:     { type: String, required: true, trim: true },
  code:     { type: String, trim: true },
}, { timestamps: true });
SubjectSchema.index({ schoolId: 1, name: 1 }, { unique: true });

// ── Class ─────────────────────────────────────────────────────────────────────
const ClassSchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  name:         { type: String, required: true },   // "JSS 1A"
  classTeacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  maxElectives: { type: Number, default: 0 },       // max elective subjects a student can pick (0 = no limit)
  subjects: [{
    subjectId:    { type: Schema.Types.ObjectId, ref: 'Subject' },
    teacherId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isCompulsory: { type: Boolean, default: true },
    _id: false,
  }],
}, { timestamps: true });
ClassSchema.index({ schoolId: 1, name: 1 }, { unique: true });

// ── Enrollment (student → class for a session) ────────────────────────────────
const EnrollmentSchema = new Schema({
  schoolId:          { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:         { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:           { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  studentId:         { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  electiveSubjectIds:[{ type: Schema.Types.ObjectId, ref: 'Subject' }],
}, { timestamps: true });
EnrollmentSchema.index({ studentId: 1, sessionId: 1 }, { unique: true });

// ── Attendance ────────────────────────────────────────────────────────────────
const AttendanceSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
  date:      { type: Date, required: true },
  records: [{
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    status:    { type: String, enum: ['Present','Absent','Late','Excused'], default: 'Present' },
    _id: false,
  }],
  markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
AttendanceSchema.index({ schoolId:1, classId:1, subjectId:1, date:1 }, { unique: true });

// ── Assessment (teacher creates: test/exam/assignment) ────────────────────────
const AssessmentSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:  { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:    { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId:  { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title:      { type: String, required: true },
  type:       { type: String, enum: ['Test','Exam','Assignment','Project'], default: 'Test' },
  maxScore:   { type: Number, required: true },
  date:       { type: Date },
  isReleased: { type: Boolean, default: false },
  quizId:     { type: Schema.Types.ObjectId, ref: 'Quiz', default: null },
}, { timestamps: true });

// ── Result (score per student per assessment) ─────────────────────────────────
const ResultSchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
  studentId:    { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  score:        { type: Number, required: true },
  grade:        { type: String },
  percentage:   { type: Number },
  remark:       { type: String },
}, { timestamps: true });
ResultSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });

// ── Quiz ──────────────────────────────────────────────────────────────────────
const QuizSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:  { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:    { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId:  { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title:      { type: String, required: true },
  duration:   { type: Number, default: 30 },  // minutes
  isOpen:     { type: Boolean, default: false },
  openUntil:  { type: Date },
  questions: [{
    text:     { type: String, required: true },
    options:  [{ type: String }],
    answer:   { type: Number },   // index of correct option
    points:   { type: Number, default: 1 },
  }],
  isAssessment: { type: Boolean, default: false },
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', default: null },
}, { timestamps: true });

// ── QuizSubmission ────────────────────────────────────────────────────────────
const QuizSubmissionSchema = new Schema({
  quizId:    { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  answers:   [{ type: Number }],  // selected option indexes
  score:     { type: Number },
  total:     { type: Number },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });
QuizSubmissionSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

// ── Assignment ────────────────────────────────────────────────────────────────
const AssignmentSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:  { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:    { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId:  { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title:      { type: String, required: true },
  description:{ type: String },
  dueDate:    { type: Date },
  maxScore:   { type: Number, default: 100 },
  fileUrl:    { type: String },  // assignment brief file
}, { timestamps: true });

// ── AssignmentSubmission ──────────────────────────────────────────────────────
const AssignmentSubmissionSchema = new Schema({
  assignmentId:{ type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId:   { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  fileUrl:     { type: String },
  note:        { type: String },
  grade:       { type: String },
  score:       { type: Number },
  gradedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });
AssignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

// ── Note (class materials teachers upload) ────────────────────────────────────
const NoteSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  uploadedBy:{ type: Schema.Types.ObjectId, ref: 'User', required: true },
  title:     { type: String, required: true },
  fileUrl:   { type: String, required: true },
  fileType:  { type: String },  // pdf, docx, mp4, etc.
}, { timestamps: true });

// ── Timetable ─────────────────────────────────────────────────────────────────
const TimetableEntrySchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
  day:       { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday'], required: true },
  startTime: { type: String, required: true },  // "08:00"
  endTime:   { type: String, required: true },  // "09:00"
}, { timestamps: true });

// ── Fee Structure ─────────────────────────────────────────────────────────────
const FeeStructureSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:   { type: Schema.Types.ObjectId, ref: 'Class', default: null }, // null = all classes
  items: [{
    label:  { type: String, required: true },
    amount: { type: Number, required: true },
    _id: false,
  }],
  totalAmount: { type: Number, default: 0 },
  dueDate:     { type: Date },
}, { timestamps: true });

// ── FeePayment ────────────────────────────────────────────────────────────────
const FeePaymentSchema = new Schema({
  schoolId:   { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:  { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  studentId:  { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  parentId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount:     { type: Number, required: true },
  reference:  { type: String, required: true, unique: true },
  status:     { type: String, enum: ['pending','success','failed'], default: 'pending' },
  channel:    { type: String },
  paidAt:     { type: Date },
  metadata:   { type: Schema.Types.Mixed },
}, { timestamps: true });

// ── Holiday / Calendar Event ──────────────────────────────────────────────────
const HolidaySchema = new Schema({
  schoolId:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:   { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  title:       { type: String, required: true },
  description: { type: String },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  type:        { type: String, enum: ['Holiday','Exam','Event','Resumption','Other'], default: 'Holiday' },
  color:       { type: String, default: '#6366f1' },
}, { timestamps: true });

// ── Branch (school can have multiple physical branches) ───────────────────────
const BranchSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  name:      { type: String, required: true, trim: true },
  address:   { type: String },
  phone:     { type: String },
  principal: { type: String },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });
BranchSchema.index({ schoolId: 1, name: 1 }, { unique: true });

// ── TermSummary (computed per-student per-session report card data) ────────────
const TermSummarySchema = new Schema({
  schoolId:     { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId:    { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  studentId:    { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId:      { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  academicYear: { type: String, required: true },
  termNumber:   { type: Number, required: true },
  subjects: [{
    subjectId:   { type: Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: { type: String },
    caScore:     { type: Number, default: 0 },
    examScore:   { type: Number, default: 0 },
    total:       { type: Number, default: 0 },
    grade:       { type: String },
    _id: false,
  }],
  totalScore:         { type: Number, default: 0 },
  average:            { type: Number, default: 0 },
  positionInClass:    { type: Number },
  classSize:          { type: Number },
  attendance:         { present: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
  classTeacherRemark: { type: String, default: '' },
  principalRemark:    { type: String, default: '' },
}, { timestamps: true });
TermSummarySchema.index({ schoolId: 1, sessionId: 1, studentId: 1 }, { unique: true });
TermSummarySchema.index({ schoolId: 1, studentId: 1, academicYear: 1 });

// ── RootUser (platform super-admin, separate from school users) ───────────────
const RootUserSchema = new Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

// ── Student Remark (teacher behavioural/general remark visible to parent) ─────
const StudentRemarkSchema = new Schema({
  schoolId:  { type: Schema.Types.ObjectId, ref: 'School', required: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  remark:    { type: String, required: true },
  category:  { type: String, enum: ['Behaviour', 'Academic', 'Punctuality', 'General'], default: 'General' },
}, { timestamps: true });
StudentRemarkSchema.index({ schoolId: 1, sessionId: 1, studentId: 1 });

// ── Notification ──────────────────────────────────────────────────────────────
const NotificationSchema = new Schema({
  schoolId:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  recipientId: { type: Schema.Types.ObjectId, required: true },  // user or student _id
  type:        { type: String, default: 'general' },
  title:       { type: String, required: true },
  body:        { type: String },
  isRead:      { type: Boolean, default: false },
  link:        { type: String },
}, { timestamps: true });
NotificationSchema.index({ recipientId: 1, isRead: 1 });

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = {
  School:               mongoose.model('School', SchoolSchema),
  User:                 mongoose.model('User', UserSchema),
  Student:              mongoose.model('Student', StudentSchema),
  AcademicSession:      mongoose.model('AcademicSession', SessionSchema),
  Subject:              mongoose.model('Subject', SubjectSchema),
  Class:                mongoose.model('Class', ClassSchema),
  Branch:               mongoose.model('Branch', BranchSchema),
  Enrollment:           mongoose.model('Enrollment', EnrollmentSchema),
  Attendance:           mongoose.model('Attendance', AttendanceSchema),
  Assessment:           mongoose.model('Assessment', AssessmentSchema),
  Result:               mongoose.model('Result', ResultSchema),
  Quiz:                 mongoose.model('Quiz', QuizSchema),
  QuizSubmission:       mongoose.model('QuizSubmission', QuizSubmissionSchema),
  Assignment:           mongoose.model('Assignment', AssignmentSchema),
  AssignmentSubmission: mongoose.model('AssignmentSubmission', AssignmentSubmissionSchema),
  Note:                 mongoose.model('Note', NoteSchema),
  TimetableEntry:       mongoose.model('TimetableEntry', TimetableEntrySchema),
  FeeStructure:         mongoose.model('FeeStructure', FeeStructureSchema),
  FeePayment:           mongoose.model('FeePayment', FeePaymentSchema),
  Holiday:              mongoose.model('Holiday', HolidaySchema),
  Notification:         mongoose.model('Notification', NotificationSchema),
  StudentRemark:        mongoose.model('StudentRemark', StudentRemarkSchema),
  TermSummary:          mongoose.model('TermSummary', TermSummarySchema),
  RootUser:             mongoose.model('RootUser', RootUserSchema),
};

// ── Subscription (SaaS billing — ₦2,000 per student per term) ────────────────
const SubscriptionSchema = new Schema({
  schoolId:        { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  sessionId:       { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
  studentCount:    { type: Number, required: true },
  pricePerStudent: { type: Number, default: 2000 },
  totalAmount:     { type: Number, required: true },
  reference:       { type: String, required: true, unique: true },
  gateway:         { type: String, enum: ['paystack', 'flutterwave'], default: 'paystack' },
  status:          { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending' },
  paidAt:          { type: Date },
  expiresAt:       { type: Date },
  // SMS quota: ₦2,000 per student / ₦10 per SMS = 200 SMS per student per term
  smsQuota:        { type: Number, default: 0 },  // set on activation = studentCount * 200
  smsUsed:         { type: Number, default: 0 },  // incremented per broadcast send
  metadata:        { type: Schema.Types.Mixed },
}, { timestamps: true });
SubscriptionSchema.index({ schoolId: 1, sessionId: 1 }, { unique: true });
module.exports.Subscription = mongoose.model('Subscription', SubscriptionSchema);
