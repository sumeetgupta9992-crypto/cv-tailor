import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
    return text.slice(firstBracket, lastBracket + 1);
  }
  return text.trim();
}

export async function POST(request: NextRequest) {
  try {
    const { cvContent, jobDescription, additionalInfo } = await request.json();

    const userPrompt = `You are a CV writing assistant preparing to write a tailored CV. Review the user's documents and job description, then generate the minimum clarifying questions needed.

CV / Uploaded Documents:
${cvContent || '(none provided)'}

Additional Information from User:
${additionalInfo || '(none provided)'}

Job Description:
${jobDescription}

Based on this content, generate ONLY questions you genuinely need answered — skip anything already clear from the documents.

Key areas to ask about (only if not clear):
1. Experience level: Fresher / 1–3 years / 4–7 years / 8+ years
2. Specific target role or job title
3. Target geography: domestic or international audience?
4. Any specific emphasis, sections, or constraints to apply

Rules:
- Generate 2–5 questions maximum
- If the CV and JD already make everything clear, return an empty array: []
- Use options (multiple choice) when there are standard choices; use null for open-ended
- Do NOT ask about things already stated in the documents

Return ONLY a JSON array. No markdown, no explanation:
[
  { "question": "What is your experience level?", "options": ["Fresher (0–1 yrs)", "Early career (1–3 yrs)", "Mid-level (4–7 yrs)", "Senior (8+ yrs)"] },
  { "question": "Which specific role are you targeting?", "options": null }
]`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const jsonStr = extractJSON(rawText);
    const questions = JSON.parse(jsonStr);

    return NextResponse.json({ success: true, questions: Array.isArray(questions) ? questions : [] });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
