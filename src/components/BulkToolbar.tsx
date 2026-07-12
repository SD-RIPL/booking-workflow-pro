import { Button } from "@/components/ui/button";
import { Trash2, Download, FileText, X } from "lucide-react";
import { exportToCsv, exportToPdf } from "@/lib/exportCsv";

type Props = {
  selectedCount: number;
  rows: any[]; // full row data for selected
  columns: Array<{ key: string; label: string }>;
  filename: string;
  canDelete?: boolean;
  onDelete?: () => void;
  onClear: () => void;
  extraActions?: React.ReactNode;
};

export function BulkToolbar({
  selectedCount, rows, columns, filename, canDelete, onDelete, onClear, extraActions,
}: Props) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-10 mx-4 mb-3 flex items-center gap-2 rounded-lg border bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium">{selectedCount} selected</span>
      <div className="flex-1" />
      <Button size="sm" variant="outline" onClick={() => exportToCsv(filename, rows, columns)}>
        <Download className="w-4 h-4 mr-1" /> CSV
      </Button>
      <Button size="sm" variant="outline" onClick={() => exportToPdf(filename, rows, columns)}>
        <FileText className="w-4 h-4 mr-1" /> PDF
      </Button>
      {extraActions}
      {canDelete && onDelete && (
        <Button size="sm" variant="destructive" onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}><X className="w-4 h-4" /></Button>
    </div>
  );
}
