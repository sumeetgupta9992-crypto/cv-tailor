import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function isDocx(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  );
}

function isPdf(file: File): boolean {
  return file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── DOCX ─────────────────────────────────────────────────────────────
    if (isDocx(file)) {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      if (!text) {
        return NextResponse.json(
          { success: false, error: 'Could not extract text from DOCX file' },
          { status: 422 }
        );
      }
      return NextResponse.json({ success: true, text });
    }

    // ── PDF ───────────────────────────────────────────────────────────────
    if (isPdf(file)) {
      const base64 = buffer.toString('base64');
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Extract all text from this CV/resume PDF and return it as plain text. Preserve structure and formatting as much as possible.

IMPORTANT — hyperlinks: if any text in the PDF is hyperlinked (e.g. the word "LinkedIn" links to a URL, or "github.com/user" is itself a hyperlink), you MUST include the full destination URL. Write it as: label (URL), for example:
  LinkedIn (https://linkedin.com/in/username)
  GitHub (https://github.com/username)
  Portfolio (https://mysite.com)

If the URL is already visible as text in the document, keep it as-is. Only add the parenthetical URL when the link text alone would not reveal the destination.`,
              },
            ],
          },
        ],
      });

      const text =
        message.content[0].type === 'text' ? message.content[0].text : '';

      return NextResponse.json({ success: true, text: text.trim() });
    }

    return NextResponse.json(
      { success: false, error: 'Only PDF and DOCX files are supported' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error parsing file:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error parsing file',
      },
      { status: 500 }
    );
  }
}
