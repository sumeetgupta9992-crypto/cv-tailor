import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

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

// Parse **bold** markers into <strong> tags
function parseBoldToHTML(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// Build bullet point HTML with proper indentation
function buildBulletHTML(bullet: string): string {
  const parsed = parseBoldToHTML(bullet);
  return `<div style="margin-left: 30px; margin-bottom: 4px; line-height: 1.2;">• ${parsed}</div>`;
}

// Build section header HTML
function buildSectionHeaderHTML(title: string): string {
  return `<h2 style="font-size: 11pt; font-weight: bold; color: #2B579A; border-bottom: 1px solid #2B579A; padding-bottom: 4px; margin: 12px 0 6px 0;">${title}</h2>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cvData }: { cvData: CVData } = body;

    if (!cvData) {
      return NextResponse.json(
        { success: false, error: 'CV data is required' },
        { status: 400 }
      );
    }

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Calibri', sans-serif;
      font-size: 10pt;
      color: #1A1A1A;
      line-height: 1.4;
      padding: 0.5in;
      max-width: 8.5in;
      margin: 0 auto;
    }
    .name {
      font-size: 18pt;
      font-weight: bold;
      color: #2B579A;
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .tagline {
      font-size: 10.5pt;
      color: #444444;
      text-align: center;
      margin-bottom: 6px;
    }
    .contact {
      font-size: 9pt;
      color: #888888;
      text-align: center;
      margin-bottom: 12px;
    }
    .contact-item {
      display: inline;
    }
    .contact-sep {
      display: inline;
      margin: 0 4px;
    }
    .summary-section {
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .summary-text {
      font-size: 9.5pt;
      line-height: 1.5;
    }
    .experience-item {
      margin-bottom: 8px;
    }
    .company-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }
    .company-name {
      font-weight: bold;
      font-size: 11pt;
      color: #1A1A1A;
    }
    .duration {
      font-style: italic;
      font-size: 9.5pt;
      color: #888888;
    }
    .role-title {
      font-weight: bold;
      font-size: 10pt;
      color: #444444;
      margin-bottom: 2px;
    }
    .education-item {
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .education-info {
      flex-grow: 1;
    }
    .institution {
      font-weight: bold;
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    .degree {
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    .education-year {
      font-style: italic;
      font-size: 9.5pt;
      color: #888888;
      white-space: nowrap;
      margin-left: 12px;
    }
    .skills-list {
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    .projects-item {
      margin-bottom: 8px;
    }
    .project-name {
      font-weight: bold;
      font-size: 10pt;
      color: #1A1A1A;
      margin-bottom: 2px;
    }
    .certifications-item {
      margin-bottom: 6px;
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    .publications-item {
      margin-bottom: 6px;
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    .interests-list {
      font-size: 9.5pt;
      color: #1A1A1A;
    }
    h2 {
      font-size: 11pt;
      font-weight: bold;
      color: #2B579A;
      border-bottom: 1px solid #2B579A;
      padding-bottom: 4px;
      margin: 12px 0 6px 0;
    }
  </style>
</head>
<body>
`;

    // Name
    html += `<div class="name">${cvData.name.toUpperCase()}</div>`;

    // Tagline
    if (cvData.tagline?.trim()) {
      html += `<div class="tagline">${cvData.tagline}</div>`;
    }

    // Contact
    if (cvData.contact) {
      const items = [];
      if (cvData.contact.email?.trim()) items.push(cvData.contact.email);
      if (cvData.contact.phone?.trim()) items.push(cvData.contact.phone);
      if (cvData.contact.location?.trim()) items.push(cvData.contact.location);

      if (items.length > 0 || cvData.contact.linkedin?.trim()) {
        html += `<div class="contact">`;
        items.forEach((item, idx) => {
          if (idx > 0) html += `<span class="contact-sep">|</span>`;
          html += `<span class="contact-item">${item}</span>`;
        });
        if (cvData.contact.linkedin?.trim()) {
          if (items.length > 0) html += `<span class="contact-sep">|</span>`;
          const raw = cvData.contact.linkedin.trim();
          const href = raw.startsWith('http') ? raw : `https://${raw}`;
          html += `<span class="contact-item"><a href="${href}" style="color: #0563C1; text-decoration: none;">${raw}</a></span>`;
        }
        html += `</div>`;
      }
    }

    // Summary
    if (cvData.summary?.trim()) {
      html += `<h2>SUMMARY</h2>`;
      html += `<div class="summary-section"><div class="summary-text">${parseBoldToHTML(cvData.summary)}</div></div>`;
    }

    // Experience
    if (cvData.experience?.length) {
      html += `<h2>EXPERIENCE</h2>`;
      for (const exp of cvData.experience) {
        html += `<div class="experience-item">`;
        html += `<div class="company-line"><span class="company-name">${exp.company}</span><span class="duration">${exp.duration}</span></div>`;
        html += `<div class="role-title">${exp.title}</div>`;
        for (const bullet of exp.bullets) {
          html += buildBulletHTML(bullet);
        }
        html += `</div>`;
      }
    }

    // Education
    if (cvData.education?.length) {
      html += `<h2>EDUCATION</h2>`;
      for (const edu of cvData.education) {
        html += `<div class="education-item">`;
        html += `<div class="education-info"><span class="institution">${edu.institution}</span> — <span class="degree">${edu.degree}</span></div>`;
        html += `<span class="education-year">${edu.year}</span>`;
        html += `</div>`;
      }
    }

    // Skills
    if (cvData.skills?.length) {
      html += `<h2>SKILLS</h2>`;
      html += `<div class="skills-list">${cvData.skills.join('  •  ')}</div>`;
    }

    // Projects
    if (cvData.projects?.length) {
      html += `<h2>PROJECTS</h2>`;
      for (const proj of cvData.projects) {
        html += `<div class="projects-item">`;
        html += `<div class="project-name">${proj.name}</div>`;
        for (const bullet of proj.bullets) {
          html += buildBulletHTML(bullet);
        }
        html += `</div>`;
      }
    }

    // Certifications
    if (cvData.certifications?.length) {
      html += `<h2>CERTIFICATIONS</h2>`;
      for (const cert of cvData.certifications) {
        html += `<div class="certifications-item">${parseBoldToHTML(cert)}</div>`;
      }
    }

    // Publications
    if (cvData.publications?.length) {
      html += `<h2>PUBLICATIONS</h2>`;
      for (const pub of cvData.publications) {
        html += `<div class="publications-item">${parseBoldToHTML(pub)}</div>`;
      }
    }

    // Interests
    if (cvData.interests?.length) {
      html += `<h2>INTERESTS</h2>`;
      html += `<div class="interests-list">${cvData.interests.join('  •  ')}</div>`;
    }

    html += `
</body>
</html>`;

    // Convert HTML to PDF using puppeteer-core + @sparticuz/chromium (Vercel-compatible)
    const browser = await puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfUint8 = await page.pdf({
      format: 'A4',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });
    await browser.close();
    const pdfBuffer = Buffer.from(pdfUint8);

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
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
