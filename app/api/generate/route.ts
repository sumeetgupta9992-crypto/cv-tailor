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

    const hasJD = Boolean(jobDescription?.trim()) && jobDescription.trim().length >= 50;

    const jdContext = hasJD
      ? `\n\nJob Description:\n${jobDescription}`
      : `\n\nNO JD PROVIDED — FORMATTING-ONLY MODE:
- The user wants their CV improved, NOT tailored to a specific role.
- PRESERVE ALL CONTENT. Do not drop any bullets, sub-roles, project descriptions, engagement headers, role context paragraphs, or details.
- PRESERVE the original structure including sub-roles within a company (e.g., 3 different roles at the same employer should remain as 3 separate sub-sections, not flattened into one).
- PRESERVE locations for each role.
- PRESERVE summary lines like 'Total Work Experience — 9.5 yrs'.
- Only improve: grammar, clarity, action verb strength, quantification, and ATS-friendly formatting.
- If the original CV fits on one page, the output MUST also fill one page. Do not compress content.
- When in doubt, KEEP the original text rather than rewriting or dropping it.`;

    let userPrompt = '';

    const PRESERVATION_RULES = `
⚠️  CONTENT PRESERVATION — CRITICAL:
- NEVER drop profile links (GitHub, LeetCode, LinkedIn, Portfolio, Codeforces, CodeChef). Include ALL links in the "links" array.
- NEVER drop GPA, percentage, board name, or stream from education entries.
- NEVER drop tech stack from projects. Every project must have "tech_stack".
- NEVER drop project links (GitHub, Live Demo). Include them in the project's "links" array.
- NEVER drop any skills from the original CV. Include ALL languages, frameworks, tools, databases, and coursework.
- NEVER drop any section. Non-standard sections (Achievements, Positions of Responsibility, etc.) go in "additional_sections".
- If the CV is under one page, include EVERYTHING. Only condense when genuinely overflowing.

SKILLS — ZERO TOLERANCE FOR DROPPING: Include EVERY SINGLE skill, language, framework, tool, and technology mentioned in the original CV. Do not consolidate, merge, or drop any skill. If the original CV lists C, C++, Java, JavaScript — all four must appear. If it lists HTML/CSS, Bash, scikit-learn, Pandas, NumPy, Tailwind, Bootstrap, NoSQL, Turborepo, MySQL — every single one must appear. Do not assume any skill is redundant or implied by another. Copy the complete skills list verbatim.

ACHIEVEMENTS AND CONTEST RANKS: Include ALL achievements, contest ranks, and ratings exactly as they appear in the original CV. Do not merge individual contest ranks into a combined line (e.g. keep "LeetCode: 1800 rating" and "Codeforces: Expert" as separate items). Only consolidate if the page is genuinely full and there is no other way to fit the content.`;

    if (currentTailoredCV && feedback) {
      userPrompt = `Refine the tailored CV below based on the user's feedback. Apply all CV writing rules from your instructions.

⚠️  CRITICAL: Every bullet point must be under 115 characters. Target 105–115 characters, biased toward 115. Count each bullet. Expand short bullets with honest detail where the source supports it — do not fabricate. Only leave a bullet under 105 if the original point was inherently brief or context is too thin to elaborate.
${PRESERVATION_RULES}

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
      userPrompt = `${hasJD ? 'Tailor' : 'Improve'} the following CV${hasJD ? ' for the job description provided' : ' — formatting and language only, preserve all content'}. Apply all CV writing rules from your instructions.

⚠️  CRITICAL: Every bullet point must be under 115 characters. Target 105–115 characters, biased toward 115. Count each bullet. Expand short bullets with honest detail where the source supports it — do not fabricate. Only leave a bullet under 105 if the original point was inherently brief or context is too thin to elaborate.
${PRESERVATION_RULES}

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

    console.log('[generate] Full cvData:', JSON.stringify(cvData, null, 2));

    // Post-processing: validate bullet point character limits
    const bulletValidationWarnings: string[] = [];
    const checkBullets = (bullets: string[], section: string) => {
      if (Array.isArray(bullets)) {
        bullets.forEach((bullet, idx) => {
          // Remove markdown bold markers for accurate character count
          const cleanBullet = bullet.replace(/\*\*.*?\*\*/g, (match) => match.slice(2, -2));
          const charCount = cleanBullet.length;
          if (charCount > 115) {
            bulletValidationWarnings.push(`[${section}] Bullet ${idx + 1} exceeds 115 chars: ${charCount} chars - "${cleanBullet.substring(0, 80)}..."`);
          }
        });
      }
    };

    // Check all sections
    if (cvData.experience) {
      cvData.experience.forEach((exp: { bullets?: string[]; sub_roles?: { bullets: string[] }[]; company: string }, idx: number) => {
        if (exp.sub_roles?.length) {
          exp.sub_roles.forEach((sr, si) => checkBullets(sr.bullets, `Experience[${idx}].sub_roles[${si}] ${exp.company}`));
        } else if (exp.bullets) {
          checkBullets(exp.bullets, `Experience[${idx}] ${exp.company}`);
        }
      });
    }
    if (cvData.projects) {
      cvData.projects.forEach((proj: { bullets: string[]; name: string }, idx: number) => {
        checkBullets(proj.bullets, `Projects[${idx}] ${proj.name}`);
      });
    }

    if (bulletValidationWarnings.length > 0) {
      console.warn('[generate] 🚨 BULLET CHARACTER LIMIT VIOLATIONS:', bulletValidationWarnings);
    } else {
      console.log('[generate] ✅ All bullets under 115 characters');
    }

    return NextResponse.json({ success: true, cvData, changes });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
