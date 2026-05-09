import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';

type Contact = {
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
};

type Experience = {
  title: string;
  company: string;
  duration: string;
  bullets: string[];
};

type Education = {
  degree: string;
  institution: string;
  year: string;
};

type Project = {
  name: string;
  bullets: string[];
};

type CVData = {
  name: string;
  tagline?: string;
  contact?: Contact;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  projects?: Project[];
  certifications?: string[];
  publications?: string[];
  interests?: string[];
};

// A4 page dimensions and layout constants (all in mm)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12.7; // 0.5 inch
const CONTENT_W = PAGE_W - MARGIN * 2;

// Hex color → [r, g, b]
function hex(h: string): [number, number, number] {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// Split text at **bold** markers → [{text, bold}]
function parseBoldSegments(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(/\*\*(.*?)\*\*/);
  return parts.map((p, i) => ({ text: p, bold: i % 2 === 1 }));
}

// Render mixed bold/normal text starting at x, y. Returns the final x after last segment.
function renderMixedText(
  doc: jsPDF,
  segments: { text: string; bold: boolean }[],
  x: number,
  y: number,
  fontSize: number,
  color: string,
  normalStyle: 'normal' | 'italic' = 'normal'
): number {
  doc.setFontSize(fontSize);
  const [r, g, b] = hex(color);
  doc.setTextColor(r, g, b);
  let curX = x;
  for (const seg of segments) {
    if (!seg.text) continue;
    const style = seg.bold ? 'bold' : normalStyle;
    doc.setFont('helvetica', style);
    doc.text(seg.text, curX, y);
    curX += doc.getTextWidth(seg.text);
  }
  return curX;
}

// Wrap a long string to fit within maxWidth at given fontSize. Returns array of lines.
function wrapText(doc: jsPDF, text: string, maxWidth: number, fontSize: number, fontStyle: 'normal' | 'bold' | 'italic' = 'normal'): string[] {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', fontStyle);
  return doc.splitTextToSize(text, maxWidth) as string[];
}

// Render wrapped plain text block. Returns new y after the block.
function renderWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  color: string,
  fontStyle: 'normal' | 'bold' | 'italic',
  lineHeight: number
): number {
  const lines = wrapText(doc, text, maxWidth, fontSize, fontStyle);
  const [r, g, b] = hex(color);
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', fontStyle);
  doc.setTextColor(r, g, b);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

// Render mixed bold/normal wrapped text. Splits on ** markers and lays out word-by-word.
function renderMixedWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  color: string,
  lineHeight: number
): number {
  const [r, g, b] = hex(color);
  doc.setFontSize(fontSize);
  doc.setTextColor(r, g, b);

  const segments = parseBoldSegments(text);
  const tokens: { word: string; bold: boolean }[] = [];
  for (const seg of segments) {
    for (const word of seg.text.split(' ')) {
      if (word) tokens.push({ word, bold: seg.bold });
    }
  }

  let y = startY;
  let curX = x;
  let isFirst = true;

  for (const { word, bold } of tokens) {
    const style = bold ? 'bold' : 'normal';
    doc.setFont('helvetica', style);
    const wordW = doc.getTextWidth(word);

    if (!isFirst) {
      doc.setFont('helvetica', 'normal');
      const spaceW = doc.getTextWidth(' ');
      if (curX + spaceW + wordW > x + maxWidth) {
        y += lineHeight;
        curX = x;
        doc.setFont('helvetica', style);
        doc.text(word, curX, y);
        curX += wordW;
      } else {
        curX += spaceW;
        doc.setFont('helvetica', style);
        doc.text(word, curX, y);
        curX += wordW;
      }
    } else {
      doc.text(word, curX, y);
      curX += wordW;
      isFirst = false;
    }
  }

  return y + lineHeight;
}

// Render a bullet point with bold-marker support. Returns new y.
function renderBullet(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const fontSize = 9.5;
  const lineH = 4.5;
  const bulletIndent = 5;
  const textX = x + bulletIndent + 2;
  const textWidth = maxWidth - bulletIndent - 2;

  const [r, g, b] = hex('1A1A1A');
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(r, g, b);
  doc.text('•', x + bulletIndent, y);

  // Word-token layout: handles bold across all line counts
  const segments = parseBoldSegments(text);
  const tokens: { word: string; bold: boolean }[] = [];
  for (const seg of segments) {
    for (const word of seg.text.split(' ')) {
      if (word) tokens.push({ word, bold: seg.bold });
    }
  }

  let curX = textX;
  let isFirst = true;

  for (const { word, bold } of tokens) {
    const style = bold ? 'bold' : 'normal';
    doc.setFont('helvetica', style);
    const wordW = doc.getTextWidth(word);

    if (!isFirst) {
      doc.setFont('helvetica', 'normal');
      const spaceW = doc.getTextWidth(' ');
      if (curX + spaceW + wordW > textX + textWidth) {
        y += lineH;
        curX = textX;
        doc.setFont('helvetica', style);
        doc.text(word, curX, y);
        curX += wordW;
      } else {
        curX += spaceW;
        doc.setFont('helvetica', style);
        doc.text(word, curX, y);
        curX += wordW;
      }
    } else {
      doc.text(word, curX, y);
      curX += wordW;
      isFirst = false;
    }
  }

  return y + lineH;
}

// Draw section header with blue underline. Returns new y.
function sectionHeader(doc: jsPDF, title: string, y: number): number {
  const [r, g, b] = hex('2B579A');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(r, g, b);
  doc.text(title, MARGIN, y);
  y += 1.5;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  return y + 4;
}

// Check if we're about to overflow the page; add new page if so.
function checkPage(doc: jsPDF, y: number, needed = 8): number {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN + 4;
  }
  return y;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cvData }: { cvData: CVData } = body;

    if (!cvData) {
      return NextResponse.json({ success: false, error: 'CV data is required' }, { status: 400 });
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = MARGIN + 4;

    // ── Name ──────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    const [nr, ng, nb] = hex('2B579A');
    doc.setTextColor(nr, ng, nb);
    doc.text(cvData.name.toUpperCase(), PAGE_W / 2, y, { align: 'center' });
    y += 7;

    // ── Tagline ───────────────────────────────────────────────────────────
    if (cvData.tagline?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      const [tr, tg, tb] = hex('444444');
      doc.setTextColor(tr, tg, tb);
      doc.text(cvData.tagline, PAGE_W / 2, y, { align: 'center' });
      y += 5.5;
    }

    // ── Contact line ──────────────────────────────────────────────────────
    if (cvData.contact) {
      const items: string[] = [];
      if (cvData.contact.email?.trim()) items.push(cvData.contact.email.trim());
      if (cvData.contact.phone?.trim()) items.push(cvData.contact.phone.trim());
      if (cvData.contact.location?.trim()) items.push(cvData.contact.location.trim());
      if (cvData.contact.linkedin?.trim()) items.push(cvData.contact.linkedin.trim());

      if (items.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const [cr, cg, cb] = hex('888888');
        doc.setTextColor(cr, cg, cb);
        doc.text(items.join('  |  '), PAGE_W / 2, y, { align: 'center' });
        y += 6;
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────
    if (cvData.summary?.trim()) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'SUMMARY', y);
      y = renderMixedWrappedText(doc, cvData.summary, MARGIN, y, CONTENT_W, 9.5, '1A1A1A', 4.5);
      y += 3;
    }

    // ── Experience ────────────────────────────────────────────────────────
    if (cvData.experience?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'EXPERIENCE', y);

      for (const exp of cvData.experience) {
        y = checkPage(doc, y, 10);

        // Company (bold, left) + Duration (italic grey, right) on same line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        const [er, eg, eb] = hex('1A1A1A');
        doc.setTextColor(er, eg, eb);
        doc.text(exp.company, MARGIN, y);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.5);
        const [dr, dg, db] = hex('888888');
        doc.setTextColor(dr, dg, db);
        doc.text(exp.duration, MARGIN + CONTENT_W, y, { align: 'right' });
        y += 4.5;

        // Role title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const [rr, rg, rb] = hex('444444');
        doc.setTextColor(rr, rg, rb);
        doc.text(exp.title, MARGIN, y);
        y += 4.5;

        // Bullets
        for (const bullet of exp.bullets) {
          y = checkPage(doc, y, 5);
          y = renderBullet(doc, bullet, MARGIN, y, CONTENT_W);
        }
        y += 2;
      }
    }

    // ── Education ─────────────────────────────────────────────────────────
    if (cvData.education?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'EDUCATION', y);

      for (const edu of cvData.education) {
        y = checkPage(doc, y, 6);
        // Institution bold + degree, year right-aligned
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const [ir, ig, ib] = hex('1A1A1A');
        doc.setTextColor(ir, ig, ib);
        const instW = doc.getTextWidth(edu.institution);
        doc.text(edu.institution, MARGIN, y);

        doc.setFont('helvetica', 'normal');
        doc.text(`  —  ${edu.degree}`, MARGIN + instW, y);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.5);
        const [yr2, yg, yb] = hex('888888');
        doc.setTextColor(yr2, yg, yb);
        doc.text(edu.year, MARGIN + CONTENT_W, y, { align: 'right' });
        y += 5;
      }
      y += 1;
    }

    // ── Skills ────────────────────────────────────────────────────────────
    if (cvData.skills?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'SKILLS', y);
      y = renderWrappedText(doc, cvData.skills.join('  •  '), MARGIN, y, CONTENT_W, 9.5, '1A1A1A', 'normal', 4.5);
      y += 2;
    }

    // ── Projects ──────────────────────────────────────────────────────────
    if (cvData.projects?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'PROJECTS', y);

      for (const proj of cvData.projects) {
        y = checkPage(doc, y, 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const [pr, pg, pb] = hex('1A1A1A');
        doc.setTextColor(pr, pg, pb);
        doc.text(proj.name, MARGIN, y);
        y += 4.5;
        for (const bullet of proj.bullets) {
          y = checkPage(doc, y, 5);
          y = renderBullet(doc, bullet, MARGIN, y, CONTENT_W);
        }
        y += 2;
      }
    }

    // ── Certifications ────────────────────────────────────────────────────
    if (cvData.certifications?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'CERTIFICATIONS', y);
      for (const cert of cvData.certifications) {
        y = checkPage(doc, y, 5);
        y = renderMixedWrappedText(doc, cert, MARGIN, y, CONTENT_W, 9.5, '1A1A1A', 4.5);
      }
      y += 2;
    }

    // ── Publications ──────────────────────────────────────────────────────
    if (cvData.publications?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'PUBLICATIONS', y);
      for (const pub of cvData.publications) {
        y = checkPage(doc, y, 5);
        y = renderMixedWrappedText(doc, pub, MARGIN, y, CONTENT_W, 9.5, '1A1A1A', 4.5);
      }
      y += 2;
    }

    // ── Interests ─────────────────────────────────────────────────────────
    if (cvData.interests?.length) {
      y = checkPage(doc, y, 12);
      y = sectionHeader(doc, 'INTERESTS', y);
      y = renderWrappedText(doc, cvData.interests.join('  •  '), MARGIN, y, CONTENT_W, 9.5, '1A1A1A', 'normal', 4.5);
    }

    // ── Output ────────────────────────────────────────────────────────────
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const safeName = cvData.name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}-tailored-cv.pdf"`,
      },
    });
  } catch (error) {
    console.error('[download-pdf] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
