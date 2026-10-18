// AC-SUB-12: a plain-text PDF (PDF 1.4, Courier, A4) with no dependency. Courier is monospaced, so
// wrapping by character count is exact. ponytail: text only, Latin-1; anything else prints as "?".
// Reach for a PDF library if the packet needs images or tables.

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const SIZE = 9.5;
const LEAD = 13;
export const PDF_LINE_CHARS = Math.floor((PAGE_W - 2 * MARGIN) / (SIZE * 0.6));
const LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LEAD);

/** Wraps on spaces at `width` characters, hard-breaking longer words; keeps a leading indent. */
export function wrap(text: string, width = PDF_LINE_CHARS): string[] {
  const indent = /^\s*/.exec(text)?.[0] ?? "";
  const out: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    for (let w = word; w;) {
      const room = width - (line ? line.length + 1 : indent.length);
      if (w.length <= room) {
        line = line ? `${line} ${w}` : `${indent}${w}`;
        w = "";
      } else if (line) {
        out.push(line);
        line = "";
      } else {
        out.push(indent + w.slice(0, room));
        w = w.slice(room);
      }
    }
  }
  out.push(line);
  return out;
}

const pdfString = (s: string) =>
  `(${s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?").replace(/[\\()]/g, "\\$&")})`;

export function textPdf(lines: string[], title: string): Buffer {
  const rows = lines.flatMap((l) => (l ? wrap(l) : [""]));
  const pages: string[][] = [];
  for (let i = 0; i < rows.length; i += LINES_PER_PAGE)
    pages.push(rows.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  // 1 catalog, 2 pages, 3 font, 4 info, then a page object and its content stream per page.
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  );
  objs.push(`<< /Title ${pdfString(title)} /Producer (Dispute Shield) >>`);
  pages.forEach((page, i) => {
    const text = page.map((l) => `${pdfString(l)} Tj T*`).join("\n");
    const stream = `BT /F1 ${SIZE} Tf ${LEAD} TL ${MARGIN} ${PAGE_H - MARGIN} Td\n${text}\nET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`,
    );
    objs.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  });

  let body = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = Buffer.byteLength(body, "latin1");
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
