import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const TEMPLATE_COLS = [
  "full_name", "father_name", "mobile", "alternate_mobile", "email",
  "address_line", "city", "district", "state", "pincode",
  "source", "sales_employee", "booking_date", "remarks", "notes",
];

const SAMPLE_ROW: Record<string, string> = {
  full_name: "Rahul Sharma",
  father_name: "Suresh Sharma",
  mobile: "9876543210",
  alternate_mobile: "",
  email: "rahul@example.com",
  address_line: "12 MG Road",
  city: "Indore",
  district: "Indore",
  state: "MP",
  pincode: "452001",
  source: "Referral",
  sales_employee: "Amit",
  booking_date: "2026-07-14",
  remarks: "",
  notes: "",
};

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: TEMPLATE_COLS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bookings");
  XLSX.writeFile(wb, "bookings_template.xlsx");
}

export function BulkImportBookingsDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const qc = useQueryClient();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<any>(sheet, { defval: "", raw: false });
        setRows(parsed);
        toast.success(`Parsed ${parsed.length} rows`);
      } catch (err: any) {
        toast.error("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function doImport() {
    if (rows.length === 0) return toast.error("No rows to import");
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("bulk_import_bookings", { _rows: rows });
      if (error) throw error;
      setResult(data);
      toast.success(`Imported ${data.inserted} bookings (${data.skipped} skipped)`);
      qc.invalidateQueries({ queryKey: ["bookings"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRows([]); setFileName(""); setResult(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="w-4 h-4 mr-2" />Bulk Import</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Bookings from Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) file. Each row becomes a new booking at stage "booking".
            Required: <b>full_name</b>, <b>mobile</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download template
            </Button>
          </div>

          <label className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-accent/30">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm">{fileName || "Click to choose .xlsx file"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>

          {rows.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium mb-2">Preview ({rows.length} rows)</div>
              <div className="max-h-40 overflow-auto text-xs">
                <table className="w-full">
                  <thead><tr>{Object.keys(rows[0]).slice(0, 5).map(k => <th key={k} className="text-left pr-2 pb-1">{k}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>{Object.keys(rows[0]).slice(0, 5).map(k => <td key={k} className="pr-2 py-0.5">{String(r[k] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>✅ Inserted: <b>{result.inserted}</b></div>
              <div>⚠️ Skipped: <b>{result.skipped}</b></div>
              {result.errors?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer">Show errors</summary>
                  <pre className="mt-2 bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(result.errors, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button disabled={busy || rows.length === 0} onClick={doImport}>
            {busy ? "Importing…" : `Import ${rows.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
