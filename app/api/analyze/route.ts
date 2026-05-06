import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYZE_SYSTEM = `You are a CV analysis assistant. Return only valid JSON, no markdown, no explanation.`;

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
    const { cvContent, jobDescription } = await request.json();

    const hasJD = Boolean(jobDescription?.trim());

    const userPrompt = `${hasJD ? 'Analyze this candidate profile against the job description.' : 'Analyze this candidate profile.'}

Profile:
${cvContent || '(not provided)'}

${hasJD ? `Job Description:\n${jobDescription}` : ''}

Return ONLY this JSON:
{
  "jd_requirements": [],
  "questions": []
}

${hasJD
  ? 'jd_requirements: array of 4-5 objects { "requirement": string, "match_status": "strong_match"|"partial_match"|"not_found" }. Cover hard requirements: visa/work authorization, minimum years of experience, mandatory skills.'
  : 'jd_requirements: empty array.'}
questions: array of 2-5 objects { "question": string, "options": string[]|null }. Ask about gaps that would strengthen the CV${hasJD ? ' or that the JD values' : ''}. Use options[] for multiple-choice, null for open-ended. Return fewer questions if the profile is already comprehensive.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: ANALYZE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonStr = extractJSON(rawText);
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({
      success: true,
      jd_requirements: Array.isArray(parsed.jd_requirements) ? parsed.jd_requirements : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
