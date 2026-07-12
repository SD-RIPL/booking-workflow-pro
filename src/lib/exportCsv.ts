// Simple CSV export helper — works for any list of records.
export function exportToCsv<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  columns?: Array<{ key: keyof T | string; label?: string }>,
) {
  if (!rows || rows.length === 0) {
    alert("No rows to export.");
    return;
  }
  const cols =
    columns ??
    Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => escape(String(c.label ?? c.key))).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = getPath(r, String(c.key));
          if (v === null || v === undefined) return "";
          if (typeof v === "object") return escape(JSON.stringify(v));
          return escape(String(v));
        })
        .join(","),
    )
    .join("\n");
  const csv = header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportToPdf(title: string, rows: any[], columns: Array<{ key: string; label: string }>) {
  // Lightweight print-to-PDF via new window — no extra dependency.
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  const style = `<style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#111}
    h1{font-size:18px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f4f4f4}
    @media print{button{display:none}}
  </style>`;
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(String(getPath(r, c.key) ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>${style}</head>
    <body><h1>${escapeHtml(title)}</h1>
    <button onclick="window.print()">Print / Save as PDF</button>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>setTimeout(()=>window.print(),300)</script>
    </body></html>`);
  w.document.close();
}

function escape(v: string) {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
function getPath(obj: any, path: string) {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}
