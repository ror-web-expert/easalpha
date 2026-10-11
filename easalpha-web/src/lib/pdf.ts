// SPEC: PDF export on purchase orders, expenses and every report. Built in the browser from the same rows the screen
// shows; the API serves CSV. One helper so every screen exports the same way.
// jspdf and jspdf-autotable (about 160 kB together) are imported inside exportTablePdf, so a page only downloads them
// the first time someone clicks the PDF button rather than on first load.

export type PdfColumn = { header: string; key: string; align?: "left" | "right" | "center" };
export type PdfOptions = { title: string; subtitle?: string; columns: PdfColumn[]; rows: Record<string, unknown>[]; footer?: string[]; filename?: string; landscape?: boolean };

export async function exportTablePdf({ title, subtitle, columns, rows, footer, filename, landscape }: PdfOptions): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  const stamp = new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  doc.text([subtitle, `Printed ${stamp}`].filter(Boolean).join("  |  "), 40, 56);
  autoTable(doc, {
    startY: 68,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => formatCell(r[c.key]))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [25, 118, 210] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || "left" }])),
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 60, doc.internal.pageSize.getHeight() - 20);
    },
  });
  if (footer?.length) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
    doc.setFontSize(9);
    footer.forEach((line, i) => doc.text(line, 40, y + 16 + i * 12));
  }
  doc.save(filename || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}

export function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v.toLocaleString("en-PK");
  if (v instanceof Date) return v.toLocaleDateString("en-PK");
  return String(v);
}
