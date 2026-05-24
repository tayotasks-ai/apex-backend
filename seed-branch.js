require('dotenv').config();
const mongoose = require('mongoose');
const { School, User, Student, Class, Branch } = require('./src/models');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const email = 'tobilobaola17@gmail.com'.toLowerCase();
    const admin = await User.findOne({ email, role: 'admin' });
    
    if (!admin) {
      console.log('Admin not found for email:', email);
      process.exit(1);
    }
    
    const schoolId = admin.schoolId;

    // 1. Create a Main Branch if one doesn't exist
    let mainBranch = await Branch.findOne({ schoolId, name: 'Main Branch' });
    if (!mainBranch) {
      mainBranch = await Branch.create({
        schoolId,
        name: 'Main Branch',
        address: '123 Main School Campus',
        phone: '08000000000',
        principal: 'Mr. Principal'
      });
      console.log('Created "Main Branch" with ID:', mainBranch._id);
    } else {
      console.log('"Main Branch" already exists with ID:', mainBranch._id);
    }

    // 2. Assign Branch to all Teachers, Parents, Students, and Classes
    
    // Update Users (teachers, parents, etc - skipping admins)
    const userRes = await User.updateMany(
      { schoolId, role: { $ne: 'admin' }, branchId: { $exists: false } },
      { $set: { branchId: mainBranch._id } }
    );
    console.log(`Assigned Branch to ${userRes.modifiedCount} users.`);

    // Update Students
    const studentRes = await Student.updateMany(
      { schoolId, branchId: { $exists: false } },
      { $set: { branchId: mainBranch._id } }
    );
    console.log(`Assigned Branch to ${studentRes.modifiedCount} students.`);

    // Update Classes
    const classRes = await Class.updateMany(
      { schoolId, branchId: { $exists: false } },
      { $set: { branchId: mainBranch._id } }
    );
    console.log(`Assigned Branch to ${classRes.modifiedCount} classes.`);

    console.log('Branch seeding completed successfully!');
    process.exit(0);

  } catch (err) {
    console.error('Error during branch seeding:', err);
    process.exit(1);
  }
}
run();
