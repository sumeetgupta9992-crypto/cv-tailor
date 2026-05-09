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

type AdditionalSection = {
  title: string;
  items: string[];
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
  additional_sections?: AdditionalSection[];
};

// A4 page dimensions (mm)
const PAGE_W = 210;
const PAGE_H = 297;

// Progressive layout attempts: try each until content fits one page
interface LayoutParams {
  bfs: number;    // body font size (pt)
  lh: number;     // body/bullet line height (mm)
  margin: number; // page margin (mm)
}

const LAYOUT_ATTEMPTS: LayoutParams[] = [
  { bfs: 9.5, lh: 4.5,  margin: 12.7 }, // default: 0.5in margin
  { bfs: 9.0, lh: 4.5,  margin: 12.7 }, // reduce body font by 0.5pt
  { bfs: 9.0, lh: 4.05, margin: 12.7 }, // reduce line spacing 10%
  { bfs: 9.0, lh: 4.05, margin: 10.2 }, // reduce margin to 0.4in
];

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
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', fontStyle);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const [r, g, b] = hex(color);
  doc.setTextColor(r, g, b);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

// Render mixed bold/normal wrapped text. Word-by-word layout across lines.
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

// Render a bullet with bold-marker support. Returns new y.
function renderBullet(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineH: number
): number {
  const bulletIndent = 5;
  const textX = x + bulletIndent + 2;
  const textWidth = maxWidth - bulletIndent - 2;

  const [r, g, b] = hex('1A1A1A');
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(r, g, b);
  doc.text('•', x + bulletIndent, y);

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
function sectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  margin: number,
  contentW: number
): number {
  const [r, g, b] = hex('2B579A');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(r, g, b);
  doc.text(title, margin, y);
  y += 1.5;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + contentW, y);
  return y + 4;
}

// Add a new page if needed. Returns updated y.
function checkPage(doc: jsPDF, y: number, needed: number, margin: number): number {
  if (y + needed > PAGE_H - margin) {
    doc.addPage();
    return margin + 4;
  }
  return y;
}

function buildPDF(cvData: CVData, p: LayoutParams): jsPDF {
  const contentW = PAGE_W - p.margin * 2;
  // Scale small decorative gaps proportionally with line height
  const gap = (base: number) => base * (p.lh / 4.5);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = p.margin + 4;

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
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'SUMMARY', y, p.margin, contentW);
    y = renderMixedWrappedText(doc, cvData.summary, p.margin, y, contentW, p.bfs, '1A1A1A', p.lh);
    y += gap(3);
  }

  // ── Experience ────────────────────────────────────────────────────────
  if (cvData.experience?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'EXPERIENCE', y, p.margin, contentW);

    for (const exp of cvData.experience) {
      y = checkPage(doc, y, 10, p.margin);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(p.bfs + 1.5);
      const [er, eg, eb] = hex('1A1A1A');
      doc.setTextColor(er, eg, eb);
      doc.text(exp.company, p.margin, y);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(p.bfs);
      const [dr, dg, db] = hex('888888');
      doc.setTextColor(dr, dg, db);
      doc.text(exp.duration, p.margin + contentW, y, { align: 'right' });
      y += p.lh;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(p.bfs + 0.5);
      const [rr, rg, rb] = hex('444444');
      doc.setTextColor(rr, rg, rb);
      doc.text(exp.title, p.margin, y);
      y += p.lh;

      for (const bullet of exp.bullets) {
        y = checkPage(doc, y, 5, p.margin);
        y = renderBullet(doc, bullet, p.margin, y, contentW, p.bfs, p.lh);
      }
      y += gap(2);
    }
  }

  // ── Education ─────────────────────────────────────────────────────────
  if (cvData.education?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'EDUCATION', y, p.margin, contentW);

    for (const edu of cvData.education) {
      y = checkPage(doc, y, 6, p.margin);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(p.bfs);
      const [ir, ig, ib] = hex('1A1A1A');
      doc.setTextColor(ir, ig, ib);
      const instW = doc.getTextWidth(edu.institution);
      doc.text(edu.institution, p.margin, y);

      doc.setFont('helvetica', 'normal');
      doc.text(`  —  ${edu.degree}`, p.margin + instW, y);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(p.bfs);
      const [yr2, yg, yb] = hex('888888');
      doc.setTextColor(yr2, yg, yb);
      doc.text(edu.year, p.margin + contentW, y, { align: 'right' });
      y += p.lh + 0.5;
    }
    y += gap(1);
  }

  // ── Skills ────────────────────────────────────────────────────────────
  if (cvData.skills?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'SKILLS', y, p.margin, contentW);
    y = renderWrappedText(doc, cvData.skills.join('  •  '), p.margin, y, contentW, p.bfs, '1A1A1A', 'normal', p.lh);
    y += gap(2);
  }

  // ── Projects ──────────────────────────────────────────────────────────
  if (cvData.projects?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'PROJECTS', y, p.margin, contentW);

    for (const proj of cvData.projects) {
      y = checkPage(doc, y, 8, p.margin);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(p.bfs + 0.5);
      const [pr, pg, pb] = hex('1A1A1A');
      doc.setTextColor(pr, pg, pb);
      doc.text(proj.name, p.margin, y);
      y += p.lh;
      for (const bullet of proj.bullets) {
        y = checkPage(doc, y, 5, p.margin);
        y = renderBullet(doc, bullet, p.margin, y, contentW, p.bfs, p.lh);
      }
      y += gap(2);
    }
  }

  // ── Certifications ────────────────────────────────────────────────────
  if (cvData.certifications?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'CERTIFICATIONS', y, p.margin, contentW);
    for (const cert of cvData.certifications) {
      y = checkPage(doc, y, 5, p.margin);
      y = renderMixedWrappedText(doc, cert, p.margin, y, contentW, p.bfs, '1A1A1A', p.lh);
    }
    y += gap(2);
  }

  // ── Publications ──────────────────────────────────────────────────────
  if (cvData.publications?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'PUBLICATIONS', y, p.margin, contentW);
    for (const pub of cvData.publications) {
      y = checkPage(doc, y, 5, p.margin);
      y = renderMixedWrappedText(doc, pub, p.margin, y, contentW, p.bfs, '1A1A1A', p.lh);
    }
    y += gap(2);
  }

  // ── Interests ─────────────────────────────────────────────────────────
  if (cvData.interests?.length) {
    y = checkPage(doc, y, 12, p.margin);
    y = sectionHeader(doc, 'INTERESTS', y, p.margin, contentW);
    y = renderWrappedText(doc, cvData.interests.join('  •  '), p.margin, y, contentW, p.bfs, '1A1A1A', 'normal', p.lh);
    y += gap(2);
  }

  // ── Additional sections (Achievements, Positions of Responsibility, etc.)
  if (cvData.additional_sections?.length) {
    for (const section of cvData.additional_sections) {
      if (!section.title || !section.items?.length) continue;
      y = checkPage(doc, y, 12, p.margin);
      y = sectionHeader(doc, section.title.toUpperCase(), y, p.margin, contentW);
      for (const item of section.items) {
        y = checkPage(doc, y, 5, p.margin);
        y = renderBullet(doc, item, p.margin, y, contentW, p.bfs, p.lh);
      }
      y += gap(2);
    }
  }

  return doc;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cvData }: { cvData: CVData } = body;

    if (!cvData) {
      return NextResponse.json({ success: false, error: 'CV data is required' }, { status: 400 });
    }

    // Try progressively tighter layouts until the PDF fits on one page
    let doc = buildPDF(cvData, LAYOUT_ATTEMPTS[0]);
    for (let i = 1; i < LAYOUT_ATTEMPTS.length && doc.getNumberOfPages() > 1; i++) {
      doc = buildPDF(cvData, LAYOUT_ATTEMPTS[i]);
    }

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
