// Table layout and inline styles are intentional for HTML email clients.
export function verificationEmail(otp: string) {
    if (!/^\d{6}$/.test(otp)) throw new Error('A six-digit verification code is required.');
    const digits = otp.split('').map((digit, index) => `<td align="center" width="16.66%" class="code-digit" style="width:16.66%;padding:0 2px;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:48px;font-weight:700;color:#080b12;${index ? 'border-left:1px solid #d9a13b;' : ''}">${digit}</td>`).join('');
    return {
        subject: 'Your Frigo Flow Verification Code',
        text: `FRIGO FLOW\n\nVERIFY YOUR EMAIL\nA quick check. Then you're in.\n\nUse the code below to verify your email address and continue with Frigo Flow.\n\nYour verification code: ${otp}\n\nExpires in 10 minutes.\nFor your security, never share this code.\nIf you did not request this code, you can ignore this email.\n\nFRIGO FLOW\nAutomated message. Please do not reply.`,
        html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Verify your email | Frigo Flow</title>
<style>body,table,td{margin:0;padding:0}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}@media only screen and (max-width:480px){.email-padding{padding:20px!important}.email-title{font-size:34px!important;line-height:37px!important}.code-digit{font-size:36px!important;line-height:44px!important}.email-icon{font-size:42px!important}.email-outer{padding:20px 12px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#eaf0f6;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;color:#080e1e;">
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Frigo Flow verification code is ${otp}. It expires in 10 minutes.</div>
<table role="presentation" width="100%" bgcolor="#eaf0f6" style="width:100%;background-color:#eaf0f6;"><tr><td align="center" class="email-outer" style="padding:34px 16px;">
<!--[if mso]><table role="presentation" width="480" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" style="width:100%;max-width:480px;border-collapse:separate;border-spacing:0;background-color:#fcfbfa;border:1px solid #dfcfad;border-radius:22px;box-shadow:0 10px 28px rgba(28,38,58,.13);"><tr><td class="email-padding" style="padding:14px 30px 20px;">
<table role="presentation" width="100%" style="width:100%;"><tr><td style="padding:0 0 5px;border-bottom:1px solid #e4d1ab;"><img src="cid:frigo-flow-logo" alt="Frigo Flow" width="200" height="73" style="display:block;width:200px;max-width:100%;height:auto;mix-blend-mode:multiply;"></td></tr></table>
<p style="margin:22px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:700;letter-spacing:1.8px;color:#bb871f;">VERIFY YOUR EMAIL</p>
<table role="presentation" width="100%" style="width:100%;"><tr><td valign="top"><h1 class="email-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:43px;letter-spacing:-1px;font-weight:400;color:#080e1e;">A quick check.<br><span style="color:#c4a16c;">Then you&rsquo;re in.</span></h1></td><td width="52" align="right" valign="top" aria-hidden="true" class="email-icon" style="width:52px;padding-top:0;font-family:Arial,Helvetica,sans-serif;font-size:52px;line-height:58px;color:#cf941d;">&#9993;&#65038;</td></tr></table>
<p style="margin:18px 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;letter-spacing:.2px;color:#687187;">Use the code below to verify your email address<br class="desktop-break"> and continue with Frigo Flow.</p>
<table role="presentation" width="100%" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e7d2b1;border-radius:15px;background-color:#ffffff;"><tr><td align="center" style="padding:14px 12px 18px;">
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.3px;color:#11141b;">YOUR VERIFICATION CODE</p>
<table role="presentation" width="100%" aria-label="Your verification code is ${otp}" style="width:100%;table-layout:fixed;"><tr>${digits}</tr></table>
</td></tr></table>
<table role="presentation" align="center" style="margin:16px auto 0;"><tr><td aria-hidden="true" style="padding-right:9px;font-size:0;line-height:22px;"><span style="display:inline-block;width:16px;height:16px;border:1px solid #c99020;border-radius:50%;line-height:14px;text-align:center;vertical-align:middle;"><span style="display:inline-block;width:4px;height:6px;border-left:1px solid #c99020;border-bottom:1px solid #c99020;margin-left:4px;vertical-align:2px;"></span></span></td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#687187;">Expires in 10 minutes</td></tr></table>
<table role="presentation" width="100%" style="width:100%;margin-top:16px;border-collapse:separate;border-spacing:0;border-radius:11px;background-color:#f4f0e9;"><tr><td align="center" style="padding:13px 8px;"><span aria-hidden="true" style="padding-right:9px;font-family:'Segoe UI Symbol',Arial,sans-serif;font-size:19px;vertical-align:middle;color:#c99020;">&#128274;&#65038;</span><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;letter-spacing:.1px;color:#687187;">For your security, never share this code.</span></td></tr></table>
<table role="presentation" width="100%" style="width:100%;margin-top:16px;"><tr><td align="center" style="border-top:1px solid #dfc899;padding-top:12px;"><p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.5px;color:#697084;">FRIGO FLOW</p><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-style:italic;color:#768094;">Automated message. Please do not reply.</p></td></tr></table>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
    };
}
