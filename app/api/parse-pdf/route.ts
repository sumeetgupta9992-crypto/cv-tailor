import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    if (!file.type.includes('pdf')) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Use Claude to extract PDF text
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
              text: 'Please extract all the text from this PDF document and return it as plain text. Preserve the structure and formatting as much as possible.',
            },
          ],
        },
      ],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({
      success: true,
      text: text.trim(),
    });
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error parsing PDF',
      },
      { status: 500 }
    );
  }
}
