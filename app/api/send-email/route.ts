import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { email, name, wordDocBuffer, pdfBuffer } = await request.json();

    if (!email || !name || !wordDocBuffer || !pdfBuffer) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const safeName = name.replace(/\s+/g, '-');

    const { error } = await resend.emails.send({
      from: 'Portkey <onboarding@resend.dev>',
      to: email,
      subject: 'Your tailored CV from Portkey',
      html: `Hi ${name},<br><br>Thanks for using Portkey.<br><br>Here's your tailored CV. Need to make changes? Visit <a href='https://cv-tailor-rho-beryl.vercel.app'>Portkey</a> to refine it.<br><br>If you liked your CV, please spread the word.<br><br>Good luck with your job search!<br><br>— Team Portkey`,
      attachments: [
        {
          filename: `${safeName}-tailored-cv.docx`,
          content: Buffer.from(wordDocBuffer, 'base64'),
        },
        {
          filename: `${safeName}-tailored-cv.pdf`,
          content: Buffer.from(pdfBuffer, 'base64'),
        },
      ],
    });

    if (error) {
      console.error('[send-email] Resend error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[send-email] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
