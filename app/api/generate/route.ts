import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { CV_INSTRUCTIONS } from '@/app/lib/cv-instructions';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cvText, jobDescription, additionalInfo, answers, currentTailoredCV, feedback } = body;

    if (!cvText) {
      return NextResponse.json(
        { success: false, error: 'CV text is required' },
        { status: 400 }
      );
    }

    type QA = { question: string; answer: string | null };
    const qaList: QA[] = Array.isArray(answers) ? answers : [];

    const qaContext = qaList.length > 0
      ? `\n\nClarifying Q&A from user:\n${qaList.map(a => `Q: ${a.question}\nA: ${a.answer ?? '(skipped)'}`).join('\n\n')}`
      : '';

    const addlContext = additionalInfo
      ? `\n\nAdditional information from user:\n${additionalInfo}`
      : '';

    const jdContext = jobDescription
      ? `\n\nJob Description:\n${jobDescription}`
      : '\n\nNo job description provided. Generate a strong, general-purpose CV highlighting the candidate\'s strongest experiences.';

    let userPrompt = '';

    if (currentTailoredCV && feedback) {
      userPrompt = `Refine the tailored CV below based on the user's feedback. Apply all CV writing rules from your instructions.

Original CV:
${cvText}${addlContext}${jdContext}${qaContext}

Current Tailored CV (JSON):
${currentTailoredCV}

User's Refinement Feedback:
${feedback}

Return a JSON object with two fields:
{
  "cvData": { ...updated CV object with same structure as before },
  "changes": ["change 1", "change 2", "change 3"]
}

In the "changes" array, list 3-5 specific improvements made (e.g., "Reordered bullets to highlight cloud architecture experience", "Refined summary to emphasize leadership impact"). Be concise and user-friendly.

Return ONLY valid JSON. No markdown, no explanation.`;
    } else {
      userPrompt = `${jobDescription ? 'Tailor' : 'Create'} the following CV${jobDescription ? ' for the job description provided' : ' highlighting the candidate\'s strongest experiences'}. Apply all CV writing rules from your instructions.

CV Content:
${cvText}${addlContext}${jdContext}${qaContext}

Return ONLY the JSON object. No markdown, no explanation.`;
    }

    console.log('[generate] system prompt (first 500 chars):', CV_INSTRUCTIONS.slice(0, 500));
    console.log('[generate] user prompt (first 500 chars):', userPrompt.slice(0, 500));

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: CV_INSTRUCTIONS,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonStr = extractJSON(rawText);
    const parsed = JSON.parse(jsonStr);

    // Handle both direct CV data and wrapped response with changes
    const cvData = parsed.cvData || parsed;
    const changes = parsed.changes || null;

    return NextResponse.json({ success: true, cvData, changes });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
