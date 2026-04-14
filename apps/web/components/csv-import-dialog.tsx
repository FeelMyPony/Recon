"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc/client";

interface CsvImportDialogProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface PreviewData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

const EXPECTED_COLUMNS: Record<string, string> = {
  name: "Name",
  category: "Category",
  suburb: "Suburb",
  state: "State",
  postcode: "Postcode",
  rating: "Rating",
  email: "Email",
  phone: "Phone",
  website: "Website",
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parsePreview(text: string): PreviewData | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const headers = parseCsvLine(lines[0]!);
  const rows = lines.slice(1, 6).map(parseCsvLine);
  return { headers, rows, totalRows: lines.length - 1 };
}

export function CsvImportDialog({ onClose, onImportComplete }: CsvImportDialogProps) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.outreach.leads.importCsv.useMutation({
    onSuccess: (data) => {
      setResult(data);
      onImportComplete();
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      setPreview(parsePreview(text));
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(() => {
    if (!csvText) return;
    importMutation.mutate({ csvData: csvText });
  }, [csvText, importMutation]);

  // Column mapping: which expected columns are detected
  const columnMapping = preview
    ? Object.entries(EXPECTED_COLUMNS).map(([key, label]) => {
        const found = preview.headers.some(
          (h) => h.toLowerCase() === key.toLowerCase(),
        );
        return { key, label, found };
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-brand-navy-900">
              Import Leads from CSV
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Upload a CSV file with lead data to bulk import
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {result ? (
            /* ── Results view ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">
                    Import complete
                  </p>
                  <p className="text-xs text-emerald-600">
                    {result.imported} lead{result.imported !== 1 ? "s" : ""}{" "}
                    imported, {result.skipped} skipped
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-800">
                      {result.errors.length} issue{result.errors.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="max-h-32 space-y-1 overflow-auto text-xs text-amber-700">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : !preview ? (
            /* ── Upload area ── */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
                isDragging
                  ? "border-brand-teal bg-brand-teal/5"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
              }`}
            >
              <Upload className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                Drop a CSV file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Accepts .csv files only
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            /* ── Preview view ── */
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">
                  {fileName}
                </span>
                <span className="text-xs text-slate-400">
                  ({preview.totalRows} row{preview.totalRows !== 1 ? "s" : ""})
                </span>
                <button
                  onClick={() => {
                    setCsvText(null);
                    setPreview(null);
                    setFileName(null);
                  }}
                  className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                >
                  Change file
                </button>
              </div>

              {/* Column mapping */}
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">
                  Column Mapping (auto-detected)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {columnMapping.map(({ key, label, found }) => (
                    <span
                      key={key}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        found
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {found ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : (
                        <span className="h-2.5 w-2.5 text-center">-</span>
                      )}
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">
                  Preview (first {Math.min(5, preview.rows.length)} rows)
                </p>
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {preview.headers.map((h, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 last:border-0"
                        >
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className="max-w-[160px] truncate whitespace-nowrap px-3 py-1.5 text-slate-600"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          {result ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-teal/90"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!preview || importMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3" />
                    Import
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
