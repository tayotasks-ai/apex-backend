const BASE_STYLE = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #334155;
`;

const layout = (content) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f8; padding:40px 20px; font-family:'Georgia',serif;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
      <!-- Header bar -->
      <tr>
        <td style="background:#0c1220; border-radius:16px 16px 0 0; padding:32px 40px; text-align:center;">
          <table cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td style="background:linear-gradient(135deg,#3b82f6,#6366f1); border-radius:14px; width:48px; height:48px; text-align:center; vertical-align:middle;">
                <span style="color:#fff; font-family:Georgia,serif; font-size:22px; font-weight:700; line-height:48px;">A</span>
              </td>
              <td style="padding-left:12px; vertical-align:middle;">
                <span style="color:#fff; font-family:Georgia,serif; font-size:20px; font-weight:700; letter-spacing:-0.3px;">ApexSchool</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Accent stripe -->
      <tr>
        <td style="background:linear-gradient(90deg,#3b82f6,#6366f1,#8b5cf6); height:4px; line-height:4px; font-size:0;">&nbsp;</td>
      </tr>
      ${content}
      <!-- Footer -->
      <tr>
        <td style="background:#0c1220; border-radius:0 0 16px 16px; padding:28px 48px; text-align:center;">
          <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#475569; margin-bottom:8px;">
            Questions? Reply to this email or contact us at <a href="mailto:support@apexschool.ng" style="color:#6366f1; text-decoration:none;">support@apexschool.ng</a>
          </p>
          <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#334155;">
            © 2025 ApexSchool · Made for Nigerian Schools
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
`;

const welcomeSchool = ({ schoolName, loginUrl }) => layout(`
      <tr>
        <td style="background:#ffffff; padding:52px 48px 40px; text-align:center;">
          <p style="font-family:Georgia,serif; font-size:13px; color:#6366f1; letter-spacing:3px; text-transform:uppercase; font-weight:600; margin-bottom:20px;">Welcome aboard</p>
          <h1 style="font-family:Georgia,serif; font-size:36px; color:#0c1220; line-height:1.15; font-weight:700; margin-bottom:20px; letter-spacing:-0.5px;">Your school is<br>ready to go. 🎓</h1>
          <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:16px; color:#64748b; line-height:1.7; max-width:400px; margin:0 auto 36px;">
            <strong style="color:#0c1220;">${schoolName}</strong> has been registered on ApexSchool.
          </p>
          <a href="${loginUrl}" style="display:inline-block; background:linear-gradient(135deg,#3b82f6,#6366f1); color:#ffffff; font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:700; text-decoration:none; padding:16px 40px; border-radius:50px; letter-spacing:0.3px;">Go to My Dashboard →</a>
        </td>
      </tr>
`);

const subscriptionConfirmed = ({ schoolName, sessionName, reference, studentCount, totalAmount, paidDate, expiresDate }) => layout(`
    <!-- Green stripe override -->
    <tr><td style="background:linear-gradient(90deg,#10b981,#059669); height:4px; line-height:4px; font-size:0;">&nbsp;</td></tr>
    <tr>
      <td style="background:#fff; padding:48px 48px 36px; text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:28px;">
          <tr><td style="background:#eef9f4; border-radius:50%; width:72px; height:72px; text-align:center; vertical-align:middle;"><span style="font-size:32px; line-height:72px;">✓</span></td></tr>
        </table>
        <p style="font-family:Georgia,serif; font-size:11px; color:#10b981; letter-spacing:3px; text-transform:uppercase; font-weight:600; margin-bottom:14px;">Subscription Active</p>
        <h1 style="font-family:Georgia,serif; font-size:32px; color:#0c1220; font-weight:700; margin-bottom:16px; letter-spacing:-0.5px;">Payment confirmed. <br>You're all set!</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; color:#64748b; line-height:1.7; max-width:400px; margin:0 auto;"><strong style="color:#0c1220;">${schoolName}</strong> is now fully subscribed for <strong style="color:#0c1220;">${sessionName}</strong>.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#fff; padding:0 48px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
          <tr><td style="background:#0c1220; padding:14px 24px;"><p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#94a3b8; letter-spacing:2px; text-transform:uppercase; font-weight:600;">Receipt Summary</p></td></tr>
          <tr><td style="padding:12px 24px; border-bottom:1px solid #e2e8f0;"><table width="100%"><tr><td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#64748b;">Reference</td><td align="right" style="font-family:'Courier New',monospace; font-size:13px; color:#0c1220; font-weight:600;">${reference}</td></tr></table></td></tr>
          <tr><td style="padding:12px 24px; border-bottom:1px solid #e2e8f0;"><table width="100%"><tr><td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#64748b;">Students billed</td><td align="right" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#0c1220; font-weight:600;">${studentCount} × ₦2,000</td></tr></table></td></tr>
          <tr><td style="padding:14px 24px; background:#f1f5f9;"><table width="100%"><tr><td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#0c1220; font-weight:700;">Total Paid</td><td align="right" style="font-family:Georgia,serif; font-size:20px; color:#10b981; font-weight:700;">₦${totalAmount}</td></tr></table></td></tr>
        </table>
      </td>
    </tr>
`);

const resultsReleased = ({ studentName, parentName, schoolName, className, assessmentTitle, grade, score, maxScore, percentage, subjectName, teacherRemark, teacherName, portalUrl }) => layout(`
    <tr>
      <td style="background:#fff; padding:48px 48px 36px;">
        <p style="font-family:Georgia,serif; font-size:11px; color:#6366f1; letter-spacing:3px; text-transform:uppercase; font-weight:600; margin-bottom:20px;">📊 Assessment Results</p>
        <h1 style="font-family:Georgia,serif; font-size:30px; color:#0c1220; font-weight:700; margin-bottom:16px; line-height:1.25; letter-spacing:-0.3px;">${studentName}'s results<br>are ready to view.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; color:#64748b; line-height:1.7; margin-bottom:32px;">Dear <strong style="color:#0c1220;">${parentName}</strong>,<br><br><strong style="color:#0c1220;">${schoolName}</strong> has released results for <strong style="color:#0c1220;">${studentName}</strong> in <strong style="color:#0c1220;">${className}</strong>.</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0c1220,#1e293b); border-radius:16px; margin-bottom:32px; overflow:hidden;">
          <tr><td style="padding:32px; text-align:center;">
            <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#64748b; letter-spacing:2px; text-transform:uppercase; margin-bottom:12px;">${assessmentTitle}</p>
            <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:12px;"><tr><td style="background:linear-gradient(135deg,#3b82f6,#6366f1); border-radius:50%; width:80px; height:80px; text-align:center; vertical-align:middle;"><span style="font-family:Georgia,serif; font-size:36px; font-weight:700; color:#fff; line-height:80px;">${grade}</span></td></tr></table>
            <p style="font-family:Georgia,serif; font-size:28px; font-weight:700; color:#fff; margin-bottom:4px;">${score} / ${maxScore}</p>
            <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#64748b;">${percentage}% · ${subjectName}</p>
          </td></tr>
        </table>
        <a href="${portalUrl}" style="display:block; background:linear-gradient(135deg,#3b82f6,#6366f1); color:#fff; font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:700; text-decoration:none; padding:16px; border-radius:50px; text-align:center; letter-spacing:0.3px;">View Full Results in Portal →</a>
      </td>
    </tr>
    <tr><td style="background:#f8fafc; border-left:3px solid #6366f1; margin:0 48px; padding:20px 32px;"><p style="font-family:Georgia,serif; font-size:14px; color:#475569; line-height:1.7; font-style:italic;">"${teacherRemark}"</p><p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#94a3b8; margin-top:8px;">— ${teacherName}, ${subjectName}</p></td></tr>
`);

const studentOnboarding = ({ schoolName, studentName, className, sessionName, studentEmail, otp, loginUrl }) => layout(`
    <tr>
      <td style="background:#fff; padding:52px 48px 40px;">
        <p style="font-family:Georgia,serif; font-size:11px; color:#8b5cf6; letter-spacing:3px; text-transform:uppercase; font-weight:600; margin-bottom:20px;">🎓 You're enrolled!</p>
        <h1 style="font-family:Georgia,serif; font-size:32px; color:#0c1220; font-weight:700; line-height:1.2; letter-spacing:-0.5px; margin-bottom:16px;">Welcome to<br>${schoolName}.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; color:#64748b; line-height:1.7; margin-bottom:36px;">Hi <strong style="color:#0c1220;">${studentName}</strong>,<br><br>You've been enrolled in <strong style="color:#0c1220;">${className}</strong> for <strong style="color:#0c1220;">${sessionName}</strong>. Use the credentials below to access your student portal.</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0c1220; border-radius:16px; margin-bottom:32px; overflow:hidden;"><tr > <td style="padding:32px;">
          <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#475569; letter-spacing:2.5px; text-transform:uppercase; font-weight:600; margin-bottom:24px;">Your Login Details</p>
          <div style="background:#1e293b; border-radius:10px; padding:14px 18px; margin-bottom:16px;"><p style="font-size:10px; color:#475569; margin-bottom:6px;">Email Address</p><p style="font-family:'Courier New',monospace; font-size:15px; color:#93c5fd; font-weight:600;">${studentEmail}</p></div>
          <div style="background:#1e293b; border-radius:10px; padding:14px 18px;"><p style="font-size:10px; color:#475569; margin-bottom:6px;">Verification OTP</p><p style="font-family:'Courier New',monospace; font-size:24px; color:#a5b4fc; font-weight:700; letter-spacing:8px;">${otp}</p></div>
        </td></tr></table>
        <a href="${loginUrl}" style="display:block; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:#fff; font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:700; text-decoration:none; padding:16px; border-radius:50px; text-align:center; letter-spacing:0.3px;">Log In to Student Portal →</a>
      </td>
    </tr>
`);

const feeReminder = ({ schoolName, parentName, studentName, className, sessionName, dueDate, tuitionAmount, levyAmount, balanceAmount, paymentUrl, schoolEmail }) => layout(`
    <!-- Amber stripe override -->
    <tr><td style="background:linear-gradient(90deg,#f59e0b,#f97316); height:4px; line-height:4px; font-size:0;">&nbsp;</td></tr>
    <tr>
      <td style="background:#fff; padding:48px 48px 36px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; margin-bottom:32px;">
          <tr><td style="padding:20px 24px; text-align:center;"><p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#92400e; letter-spacing:2px; text-transform:uppercase; font-weight:600; margin-bottom:6px;">Payment Due</p><p style="font-family:Georgia,serif; font-size:28px; font-weight:700; color:#b45309;">${dueDate}</p></td></tr>
        </table>
        <h1 style="font-family:Georgia,serif; font-size:30px; color:#0c1220; font-weight:700; margin-bottom:16px; line-height:1.25; letter-spacing:-0.3px;">School fees are<br>due soon.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; color:#64748b; line-height:1.7; margin-bottom:32px;">Dear <strong style="color:#0c1220;">${parentName}</strong>,<br><br>This is a friendly reminder that school fees for <strong style="color:#0c1220;">${studentName}</strong> (${className}) are due.</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:32px;">
          <tr><td style="padding:14px 24px; border-bottom:1px solid #e2e8f0;"><table width="100%"><tr><td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#64748b;">Tuition Fee</td><td align="right" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#0c1220; font-weight:600;">₦${tuitionAmount}</td></tr></table></td></tr>
          <tr><td style="padding:14px 24px; background:#fef9c3;"><table width="100%"><tr><td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#92400e; font-weight:700;">Outstanding Balance</td><td align="right" style="font-family:Georgia,serif; font-size:20px; color:#d97706; font-weight:700;">₦${balanceAmount}</td></tr></table></td></tr>
        </table>
        <a href="${paymentUrl}" style="display:block; background:linear-gradient(135deg,#f59e0b,#f97316); color:#fff; font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:700; text-decoration:none; padding:16px; border-radius:50px; text-align:center; letter-spacing:0.3px;">Pay Fees Now →</a>
      </td>
    </tr>
`);

const inviteStaff = ({ schoolName, name, role, otp, verifyUrl }) => layout(`
    <tr>
      <td style="background:#fff; padding:52px 48px 40px;">
        <p style="font-family:Georgia,serif; font-size:11px; color:#3b82f6; letter-spacing:3px; text-transform:uppercase; font-weight:600; margin-bottom:20px;">Verification Code</p>
        <h1 style="font-family:Georgia,serif; font-size:32px; color:#0c1220; font-weight:700; line-height:1.2; letter-spacing:-0.5px; margin-bottom:16px;">Welcome to<br>${schoolName}.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; color:#64748b; line-height:1.7; margin-bottom:36px;">Hi <strong style="color:#0c1220;">${name}</strong>,<br><br>You have been invited as a <strong style="color:#0c1220;">${role}</strong>. Your verification code is:</p>
        <div style="background:#0c1220; border-radius:16px; padding:32px; text-align:center; margin-bottom:32px;">
          <h1 style="color:#fff; font-family:Georgia,serif; font-size:48px; letter-spacing:12px; margin:0;">${otp}</h1>
        </div>
        <a href="${verifyUrl}" style="display:block; background:linear-gradient(135deg,#3b82f6,#6366f1); color:#fff; font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:700; text-decoration:none; padding:16px; border-radius:50px; text-align:center; letter-spacing:0.3px;">Verify & Set Password →</a>
      </td>
    </tr>
`);

module.exports = { welcomeSchool, subscriptionConfirmed, resultsReleased, studentOnboarding, inviteStaff };
