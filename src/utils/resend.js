const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    const data = await resend.emails.send({
      from: 'ApexSchool <apexschool@kumutech.com.ng>', // Should be a verified domain in production
      to,
      subject,
      html,
    });
    console.log('Email sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Email error details:', error.response?.data || error);
    return null;
  }
};

module.exports = { sendEmail };
