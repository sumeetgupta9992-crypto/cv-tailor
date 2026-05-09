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

type Link = {
  label: string;
  url: string;
};

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
  gpa_or_percentage?: string | null;
  details?: string | null;
};

type Project = {
  name: string;
  description?: string | null;
  tech_stack?: string | null;
  links?: Link[];
  bullets: string[];
};

type AdditionalSection = {
  title: string;
  items: string[];
};

type SkillCategories = {
  languages?: string[];
  frameworks_and_tools?: string[];
  cloud_databases_infra?: string[];
  coursework?: string[];
};

type CVData = {
  name: string;
  // New flat contact fields (preferred by schema v2)
  email?: string;
  phone?: string;
  location?: string;
  links?: Link[];
  // Legacy nested contact object (backward compat)
  contact?: Contact;
  tagline?: string;
  summary: string;
  skills?: string[] | SkillCategories;
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

// Right tab stop (twips). A4 text width with 720-twip margins ≈ 10466 twips.
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

function safeHref(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
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
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: cvData.name.toUpperCase(),
            bold: true,
            size: 28,
            color: "2B579A",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
      })
    );

    // ── Tagline ───────────────────────────────────────────────────────────
    if (cvData.tagline?.trim()) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: cvData.tagline, size: 21, color: "444444" }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 20 },
        })
      );
    }

    // ── Contact + Links ───────────────────────────────────────────────────
    // Resolve contact from flat fields (schema v2) or legacy contact object
    const contactEmail = cvData.email || cvData.contact?.email;
    const contactPhone = cvData.phone || cvData.contact?.phone;
    const contactLocation = cvData.location || cvData.contact?.location;
    const legacyLinkedIn = cvData.contact?.linkedin;

    const allLinks: Link[] = [
      ...(legacyLinkedIn?.trim() ? [{ label: "LinkedIn", url: legacyLinkedIn.trim() }] : []),
      ...(cvData.links || []).filter((l) => l.url?.trim()),
    ];

    const textContactItems = [contactEmail, contactPhone, contactLocation].filter(
      (v): v is string => Boolean(v?.trim())
    );

    if (textContactItems.length || allLinks.length) {
      const sep = () => new TextRun({ text: "  |  ", size: 20, color: "888888" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineChildren: any[] = [];

      textContactItems.forEach((item, i) => {
        if (i > 0) lineChildren.push(sep());
        lineChildren.push(new TextRun({ text: item.trim(), size: 20, color: "888888" }));
      });

      allLinks.forEach((link, i) => {
        if (textContactItems.length > 0 || i > 0) lineChildren.push(sep());
        lineChildren.push(
          new ExternalHyperlink({
            link: safeHref(link.url),
            children: [new TextRun({ text: link.label || link.url, size: 20 })],
          })
        );
      });

      children.push(
        new Paragraph({
          children: lineChildren,
          alignment: AlignmentType.CENTER,
          spacing: { before: 20, after: 80 },
        })
      );
    }

    // ── Summary ───────────────────────────────────────────────────────────
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
    if (cvData.experience?.length) {
      children.push(sectionHeader("EXPERIENCE"));

      for (const exp of cvData.experience) {
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
        children.push(
          new Paragraph({
            children: [new TextRun({ text: exp.title, bold: true, size: 20, color: "444444" })],
            spacing: { before: 0, after: 0 },
          })
        );
        for (const bullet of exp.bullets) {
          children.push(bulletParagraph(bullet));
        }
      }
    }

    // ── Education ─────────────────────────────────────────────────────────
    if (cvData.education?.length) {
      children.push(sectionHeader("EDUCATION"));

      for (const edu of cvData.education) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eduChildren: any[] = [
          new TextRun({ text: edu.institution, bold: true, size: 19, color: "1A1A1A" }),
          new TextRun({ text: "  —  " + edu.degree, size: 19, color: "1A1A1A" }),
        ];

        if (edu.gpa_or_percentage?.trim()) {
          eduChildren.push(
            new TextRun({ text: "  |  " + edu.gpa_or_percentage.trim(), size: 19, color: "444444" })
          );
        }

        eduChildren.push(new Tab());
        eduChildren.push(new TextRun({ text: edu.year, italics: true, size: 19, color: "888888" }));

        children.push(
          new Paragraph({
            children: eduChildren,
            tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
            spacing: { before: 60, after: 0 },
          })
        );

        if (edu.details?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: edu.details.trim(), size: 17, italics: true, color: "888888" }),
              ],
              spacing: { before: 0, after: 0 },
            })
          );
        }
      }
    }

    // ── Skills ────────────────────────────────────────────────────────────
    if (cvData.skills) {
      const isArr = Array.isArray(cvData.skills);
      const hasSkills = isArr
        ? (cvData.skills as string[]).length > 0
        : Object.values(cvData.skills as SkillCategories).some((v) => v?.length);

      if (hasSkills) {
        children.push(sectionHeader("SKILLS"));

        if (isArr) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: (cvData.skills as string[]).join("  •  "), size: 19, color: "1A1A1A" }),
              ],
              spacing: { before: 40, after: 0 },
            })
          );
        } else {
          const cats = cvData.skills as SkillCategories;
          const catEntries = [
            { key: "languages", label: "Languages" },
            { key: "frameworks_and_tools", label: "Frameworks & Tools" },
            { key: "cloud_databases_infra", label: "Cloud / Databases / Infra" },
            { key: "coursework", label: "Coursework" },
          ];
          for (const { key, label } of catEntries) {
            const items = cats[key as keyof SkillCategories];
            if (items?.length) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: label + ": ", bold: true, size: 19, color: "1A1A1A" }),
                    new TextRun({ text: items.join("  •  "), size: 19, color: "1A1A1A" }),
                  ],
                  spacing: { before: 20, after: 0 },
                })
              );
            }
          }
        }
      }
    }

    // ── Projects ──────────────────────────────────────────────────────────
    if (cvData.projects?.length) {
      children.push(sectionHeader("PROJECTS"));

      for (const proj of cvData.projects) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const projNameChildren: any[] = [
          new TextRun({ text: proj.name, bold: true, size: 20, color: "1A1A1A" }),
        ];

        if (proj.links?.length) {
          for (const link of proj.links) {
            projNameChildren.push(new TextRun({ text: "  ", size: 19 }));
            projNameChildren.push(
              new ExternalHyperlink({
                link: safeHref(link.url),
                children: [new TextRun({ text: `[${link.label}]`, size: 17, color: "2B579A" })],
              })
            );
          }
        }

        children.push(
          new Paragraph({ children: projNameChildren, spacing: { before: 60, after: 0 } })
        );

        if (proj.tech_stack?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: proj.tech_stack.trim(), size: 17, italics: true, color: "444444" }),
              ],
              spacing: { before: 0, after: 0 },
            })
          );
        }

        if (proj.description?.trim()) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: proj.description.trim(), size: 17, color: "444444" })],
              spacing: { before: 0, after: 0 },
            })
          );
        }

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
          children: [
            new TextRun({ text: cvData.interests.join("  •  "), size: 19, color: "1A1A1A" }),
          ],
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
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri" } },
        },
      },
      sections: [
        {
          properties: {
            page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
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
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
