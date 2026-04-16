import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_USER = os.getenv("SMTP_USER", "aravind2005ak@gmail.com")
SMTP_PASS = os.getenv("SMTP_PASS", "xpwf gxru wtfb ndgs")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

def send_status_email(to_email: str, employee_name: str, filename: str, new_status: str, manager_name: str, manager_comment: str = None):
    """
    Sends an email to the employee notifying them of a status change.
    Designed to be run via FastAPI BackgroundTasks so it doesn't block the request.
    """
    if not to_email:
        return

    subject = f"Drawing {new_status.replace('_', ' ').title()}: {filename}"
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: {'#1f883d' if new_status == 'approved' else '#cf222e'}; color: #fff; padding: 15px 20px;">
            <h2 style="margin: 0;">Status Update: {new_status.replace('_', ' ').upper()}</h2>
          </div>
          <div style="padding: 20px;">
            <p>Hi {employee_name},</p>
            <p>Your drawing <strong>{filename}</strong> has been marked as <strong>{new_status.replace('_', ' ')}</strong> by your manager, {manager_name}.</p>
            """
            
    if manager_comment:
        html_content += f"""
            <div style="background-color: #f6f8fa; border-left: 4px solid #0969da; padding: 10px 15px; margin: 20px 0;">
                <p style="margin: 0; font-style: italic;">"{manager_comment}"</p>
            </div>
            """
            
    html_content += """
            <p>Please log in to the Telecom CAD Review System to view the full details.</p>
            <br/>
            <p style="font-size: 12px; color: #888;">This is an automated notification from the CAD Review System.</p>
          </div>
        </div>
      </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Telecom CAD System <{SMTP_USER}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
            print(f"Email sent successfully to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {str(e)}")
