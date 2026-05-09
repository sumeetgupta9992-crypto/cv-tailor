import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Tab,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
  TabStopType,
} from "docx";

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

// Split "**bold**" markers into TextRun arrays
function parseBoldRuns(text: string, size: number, color: string): TextRun[] {
  const parts = text.split(/\*\*(.*?)\*\*/);
  return parts.map(
    (part, i) => new TextRun({ text: part, bold: i % 2 === 1, size, color })
  );
}

// Right tab stop (twips). A4 text width with 720-twip margins = 11906 − 1440 = 10466.
// Use 10100 so it fits safely on both A4 and Letter.
const RIGHT_TAB = 10100;

function sectionHeader(title: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 22, color: "2B579A" })],
    border: {
      bottom: { color: "2B579A", style: BorderStyle.SINGLE, size: 4, space: 4 },
    },
    spacing: { before: 80, after: 40 },
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "•\t", size: 21, color: "1A1A1A" }),
      ...parseBoldRuns(text, 21, "1A1A1A"),
    ],
    indent: { left: 240, hanging: 240 },
    spacing: { before: 0, after: 0, line: 240 },
  });
}

// Build the contact line paragraph. Returns null if no contact fields present.
function buildContactParagraph(contact: Contact): Paragraph | null {
  // Collect plain-text items
  const textItems: string[] = [
    contact.email,
    contact.phone,
    contact.location,
  ].filter((v): v is string => Boolean(v?.trim()));

  const hasLinkedIn = Boolean(contact.linkedin?.trim());
  if (textItems.length === 0 && !hasLinkedIn) return null;

  const sep = () => new TextRun({ text: "  |  ", size: 20, color: "888888" });

  // Using a typed union that docx accepts for Paragraph children
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  textItems.forEach((item, i) => {
    if (i > 0) children.push(sep());
    children.push(new TextRun({ text: item, size: 20, color: "888888" }));
  });

  if (hasLinkedIn) {
    if (children.length > 0) children.push(sep());
    const raw = contact.linkedin!.trim();
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    children.push(
      new ExternalHyperlink({
        link: href,
        children: [
          // Let Word's built-in hyperlink style (blue, underlined) apply
          new TextRun({ text: raw, size: 20 }),
        ],
      })
    );
  }

  return new Paragraph({
    children,
    alignment: AlignmentType.CENTER,
    spacing: { before: 20, after: 80 },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cvData }: { cvData: CVData } = body;

    if (!cvData) {
      return NextResponse.json(
        { success: false, error: "CV data is required" },
        { status: 400 }
      );
    }

    const children: Paragraph[] = [];

    // ── Name ──────────────────────────────────────────────────────────────
    // Spec: 18pt, bold, centered, dark blue #2B579A, all caps
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: cvData.name.toUpperCase(),
            bold: true,
            size: 28,         // 14pt = 28 half-points
            color: "2B579A",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
      })
    );

    // ── Tagline ───────────────────────────────────────────────────────────
    // Spec: 10.5pt, centered, medium gray #444444
    if (cvData.tagline?.trim()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cvData.tagline,
              size: 21,         // 10.5pt = 21 half-points
              color: "444444",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 20 },
        })
      );
    }

    // ── Contact line ──────────────────────────────────────────────────────
    // Spec: 9pt, centered, light gray #888888, items separated by " | ", LinkedIn as hyperlink
    if (cvData.contact) {
      const contactPara = buildContactParagraph(cvData.contact);
      if (contactPara) children.push(contactPara);
    }

    // ── Summary ───────────────────────────────────────────────────────────
    // Spec: no bold in summary (it's a narrative paragraph)
    if (cvData.summary?.trim()) {
      children.push(sectionHeader("SUMMARY"));
      children.push(
        new Paragraph({
          children: parseBoldRuns(cvData.summary, 19, "1A1A1A"),
          spacing: { before: 40, after: 60 },
        })
      );
    }

    // ── Experience ────────────────────────────────────────────────────────
    // Spec: company bold 11pt black + date right-aligned 9.5pt italic gray
    //       role title bold 10pt medium gray #444444
    //       bullets 9.5pt black, • char, left 360 / hanging 200 twips
    if (cvData.experience?.length) {
      children.push(sectionHeader("EXPERIENCE"));

      for (const exp of cvData.experience) {
        // Company + date — tab stop right-aligns date; ATS-friendly plain text
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: exp.company + "  ", bold: true, size: 22, color: "1A1A1A" }),
              new Tab(),
              new TextRun({ text: exp.duration, italics: true, size: 19, color: "888888" }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
            spacing: { before: 120, after: 0 },
          })
        );

        // Role title
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: exp.title, bold: true, size: 20, color: "444444" }),
            ],
            spacing: { before: 0, after: 0 },
          })
        );

        // Bullets
        for (const bullet of exp.bullets) {
          children.push(bulletParagraph(bullet));
        }
      }
    }

    // ── Education ─────────────────────────────────────────────────────────
    // Spec: institution name bold, degree + score regular weight, year right-aligned
    if (cvData.education?.length) {
      children.push(sectionHeader("EDUCATION"));

      for (const edu of cvData.education) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: edu.institution, bold: true, size: 19, color: "1A1A1A" }),
              new TextRun({ text: "  —  " + edu.degree + "  ", size: 19, color: "1A1A1A" }),
              new Tab(),
              new TextRun({ text: edu.year, italics: true, size: 19, color: "888888" }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
            spacing: { before: 60, after: 0 },
          })
        );
      }
    }

    // ── Skills ────────────────────────────────────────────────────────────
    if (cvData.skills?.length) {
      children.push(sectionHeader("SKILLS"));
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cvData.skills.join("  •  "),
              size: 19,
              color: "1A1A1A",
            }),
          ],
          spacing: { before: 40, after: 0 },
        })
      );
    }

    // ── Projects ──────────────────────────────────────────────────────────
    if (cvData.projects?.length) {
      children.push(sectionHeader("PROJECTS"));
      for (const proj of cvData.projects) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: proj.name, bold: true, size: 20, color: "1A1A1A" })],
            spacing: { before: 60, after: 0 },
          })
        );
        for (const bullet of proj.bullets) {
          children.push(bulletParagraph(bullet));
        }
      }
    }

    // ── Certifications ────────────────────────────────────────────────────
    if (cvData.certifications?.length) {
      children.push(sectionHeader("CERTIFICATIONS"));
      for (const cert of cvData.certifications) {
        children.push(
          new Paragraph({
            children: parseBoldRuns(cert, 19, "1A1A1A"),
            spacing: { before: 40, after: 0 },
          })
        );
      }
    }

    // ── Publications ──────────────────────────────────────────────────────
    if (cvData.publications?.length) {
      children.push(sectionHeader("PUBLICATIONS"));
      for (const pub of cvData.publications) {
        children.push(
          new Paragraph({
            children: parseBoldRuns(pub, 19, "1A1A1A"),
            spacing: { before: 40, after: 0 },
          })
        );
      }
    }

    // ── Interests ─────────────────────────────────────────────────────────
    if (cvData.interests?.length) {
      children.push(sectionHeader("INTERESTS"));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: cvData.interests.join("  •  "), size: 19, color: "1A1A1A" })],
          spacing: { before: 40, after: 0 },
        })
      );
    }

    // ── Additional sections (Achievements, Positions of Responsibility, etc.)
    if (cvData.additional_sections?.length) {
      for (const section of cvData.additional_sections) {
        if (!section.title || !section.items?.length) continue;
        children.push(sectionHeader(section.title.toUpperCase()));
        for (const item of section.items) {
          children.push(bulletParagraph(item));
        }
      }
    }

    // ── Assemble document ─────────────────────────────────────────────────
    // Spec: A4/Letter, 720 twip margins on all sides (0.5 inch), Calibri font
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: "Calibri" },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeName = cvData.name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}-tailored-cv.docx"`,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
