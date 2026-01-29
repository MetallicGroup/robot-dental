const nodemailer = require('nodemailer');
require('dotenv').config();

// Configurează transporter-ul de email (folosește SMTP sau servicii precum Gmail, SendGrid, etc.)
// Pentru Gmail, poți folosi App Password: https://support.google.com/accounts/answer/185833
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true pentru 465, false pentru alte porturi
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const EmailService = {
  async sendAutocallSummary(to, appointmentData, transcript, recordingUrl) {
    try {
      const { date, time, patientName, patientPhone, doctorName, locationName, locationAddress } = appointmentData;

      const subject = `Rezumat programare Autocalls - ${date} ${time}`;

      let htmlBody = `
        <h2>Rezumat programare Autocalls</h2>
        <p><strong>Data:</strong> ${date}</p>
        <p><strong>Ora:</strong> ${time}</p>
        <p><strong>Pacient:</strong> ${patientName || 'N/A'}</p>
        <p><strong>Telefon:</strong> ${patientPhone}</p>
        <p><strong>Medic:</strong> ${doctorName || 'N/A'}</p>
        <p><strong>Locație:</strong> ${locationName || 'N/A'}</p>
        ${locationAddress ? `<p><strong>Adresă:</strong> ${locationAddress}</p>` : ''}
      `;

      if (transcript) {
        htmlBody += `
          <hr>
          <h3>Rezumat conversație</h3>
          <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 5px;">${transcript}</pre>
        `;
      }

      if (recordingUrl) {
        htmlBody += `
          <hr>
          <h3>Înregistrare apel</h3>
          <p><a href="${recordingUrl}" target="_blank">Ascultă înregistrarea apelului</a></p>
        `;
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: to,
        subject: subject,
        html: htmlBody,
        text: `
Rezumat programare Autocalls
Data: ${date}
Ora: ${time}
Pacient: ${patientName || 'N/A'}
Telefon: ${patientPhone}
Medic: ${doctorName || 'N/A'}
Locație: ${locationName || 'N/A'}
${locationAddress ? `Adresă: ${locationAddress}` : ''}

${transcript ? `\nRezumat conversație:\n${transcript}` : ''}
${recordingUrl ? `\nÎnregistrare: ${recordingUrl}` : ''}
        `.trim()
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('[EMAIL] Sent autocall summary to', to, 'Message ID:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('[EMAIL] Error sending autocall summary:', error.message);
      return { success: false, error: error.message };
    }
  }
};

module.exports = EmailService;
