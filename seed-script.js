require('dotenv').config();
const mongoose = require('mongoose');
const { School, User, Student, AcademicSession, Class, Subscription, Enrollment } = require('./src/models');
const bcrypt = require('bcryptjs');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const email = 'tobilobaola17@gmail.com'.toLowerCase();
    let user = await User.findOne({ email, role: 'admin' }).populate('schoolId');
    let school;

    if (user) {
      school = await School.findById(user.schoolId);
    } else {
      school = await School.findOne({ email });
    }

    if (!school) {
      console.log('School/Admin not found for email:', email);
      process.exit(1);
    }

    console.log('Found School:', school.name);

    // 1. Subscribe school
    school.plan = 'pro';
    school.isActive = true;
    await school.save();
    console.log('School marked as subscribed (pro, isActive: true).');

    // 2. Ensure an AcademicSession exists
    let session = await AcademicSession.findOne({ schoolId: school._id, isCurrent: true });
    if (!session) {
      session = await AcademicSession.findOne({ schoolId: school._id });
    }
    if (!session) {
      console.log('No AcademicSession found, creating a default one.');
      session = await AcademicSession.create({
        schoolId: school._id,
        name: '2025/2026 First Term',
        academicYear: '2025/2026',
        termNumber: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        isCurrent: true,
      });
    }

    // Create Subscription
    let sub = await Subscription.findOne({ schoolId: school._id, sessionId: session._id });
    if (!sub) {
      await Subscription.create({
        schoolId: school._id,
        sessionId: session._id,
        studentCount: 10,
        pricePerStudent: 2000,
        totalAmount: 20000,
        reference: 'TEST_SUB_' + Date.now(),
        gateway: 'paystack',
        status: 'active',
        paidAt: new Date(),
        expiresAt: session.endDate,
      });
      console.log('Created active Subscription for the session.');
    } else {
      sub.status = 'active';
      await sub.save();
      console.log('Updated existing Subscription to active.');
    }

    const defaultPassword = await bcrypt.hash('Password123', 10);

    // 3. Seed Teachers
    console.log('Seeding 10 Teachers...');
    const teachers = [];
    for (let i = 1; i <= 10; i++) {
      let tEmail = `teacher${i}@example.com`;
      let teacher = await User.findOne({ schoolId: school._id, email: tEmail });
      if (!teacher) {
        teacher = await User.create({
          schoolId: school._id,
          name: `Teacher ${i}`,
          email: tEmail,
          phone: `080200000${i.toString().padStart(2, '0')}`,
          password: defaultPassword,
          role: 'teacher',
          isActive: true,
          isVerified: true
        });
        console.log(`Created Teacher ${i} (${tEmail})`);
      } else {
        teacher.password = defaultPassword;
        await teacher.save();
        console.log(`Teacher ${i} already exists, password updated.`);
      }
      teachers.push(teacher);
    }

    // 4. Ensure a Class exists
    let cls = await Class.findOne({ schoolId: school._id });
    if (!cls) {
      cls = await Class.create({
        schoolId: school._id,
        name: 'JSS 1A',
        classTeacher: teachers[0]._id // Assign first teacher as class teacher
      });
      console.log('Created a Class:', cls.name);
    }

    // 5. Seed Parents
    console.log('Seeding 10 Parents...');
    const parents = [];
    for (let i = 1; i <= 10; i++) {
      let pEmail = `parent${i}@example.com`;
      let parent = await User.findOne({ schoolId: school._id, email: pEmail });
      if (!parent) {
        parent = await User.create({
          schoolId: school._id,
          name: `Parent ${i}`,
          email: pEmail,
          phone: `080300000${i.toString().padStart(2, '0')}`,
          password: defaultPassword,
          role: 'parent',
          isActive: true,
          isVerified: true
        });
        console.log(`Created Parent ${i} (${pEmail})`);
      } else {
        parent.password = defaultPassword;
        await parent.save();
        console.log(`Parent ${i} already exists, password updated.`);
      }
      parents.push(parent);
    }

    // 6. Seed Students & Enroll them
    console.log('Seeding 10 Students and Enrolling them...');
    for (let i = 1; i <= 10; i++) {
      let sEmail = `student${i}@example.com`;
      let admissionNo = `ADM-00${i}-${Date.now().toString().slice(-4)}`;
      let student = await Student.findOne({ schoolId: school._id, email: sEmail });
      
      if (!student) {
        student = await Student.create({
          schoolId: school._id,
          firstName: `Student`,
          lastName: `${i}`,
          email: sEmail,
          gender: i % 2 === 0 ? 'Female' : 'Male',
          admissionNo,
          parentId: parents[i - 1]._id,
          password: defaultPassword,
          isActive: true,
          isVerified: true
        });
        console.log(`Created Student ${i} (${sEmail}) linked to Parent ${i}`);
      } else {
        student.parentId = parents[i - 1]._id;
        student.password = defaultPassword;
        await student.save();
        console.log(`Student ${i} already exists, updated parent link and password.`);
      }

      // Enroll student in class
      let enr = await Enrollment.findOne({ studentId: student._id, sessionId: session._id });
      if (!enr) {
        await Enrollment.create({
          schoolId: school._id,
          sessionId: session._id,
          classId: cls._id,
          studentId: student._id
        });
        console.log(`Enrolled Student ${i} in class ${cls.name}`);
      } else {
        console.log(`Student ${i} already enrolled.`);
      }
    }

    console.log('Seeding completed successfully!');
    process.exit(0);

  } catch (err) {
    console.error('Error during seeding:', err);
    process.exit(1);
  }
}
run();
