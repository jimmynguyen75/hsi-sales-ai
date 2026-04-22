/**
 * BulkImportDialog — reusable CSV upload flow.
 *
 * Two-step: user picks a file → we call the endpoint with dryRun=true and
 * show a preview + validation report → user confirms → we call again with
 * dryRun=false to commit.
 *
 * The endpoint is a prop so we can reuse this for /accounts, /products, and
 * anything else later.
 */
import { useState } from "react";
import { Upload, FileCheck2, AlertTriangle, X, Download } from "lucide-react";
import { useToast } from "@/components/Toast";

interface BulkReport {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
  preview?: Array<Record<string, string>>;
}

interface Props {
  title: string;
  endpoint: string; // e.g. "/import/accounts"
  sampleDownloadPath?: string; // e.g. "/import/sample/accounts.csv"
  expectedColumns: string[]; // shown in the help text
  onClose: () => void;
  onImported: (report: BulkReport) => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

function getToken(): string | null {
  return localStorage.getItem("hsi_token");
}

async function submit(endpoint: string, file: File, dryRun: boolean): Promise<BulkReport> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("dryRun", dryRun ? "true" : "false");
  const token = getToken();
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json.data as BulkReport;
}

export function BulkImportDialog({
  title,
  endpoint,
  sampleDownloadPath,
  expectedColumns,
  onClose,
  onImported,
}: Props) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [dryReport, setDryReport] = useState<BulkReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function runDryRun() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await submit(endpoint, file, true);
      setDryReport(r);
    } catch (err) {
      toast.error(
        "Không đọc được file",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await submit(endpoint, file, false);
      toast.success(
        "Import hoàn tất",
        `Thêm ${r.created} / cập nhật ${r.updated} / lỗi ${r.errors.length}`,
      );
      onImported(r);
    } catch (err) {
      toast.error(
        "Import thất bại",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadSample() {
    if (!sampleDownloadPath) return;
    const token = getToken();
    const res = await fetch(`${API_URL}${sampleDownloadPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sampleDownloadPath.split("/").pop() ?? "sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-brand-600" />
            <h3 className="font-semibold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 overflow-y-auto">
          <div className="text-xs text-slate-600">
            File CSV (UTF-8, comma hoặc semicolon). Dòng đầu là header. Cột kỳ vọng:
            <div className="mt-1 font-mono text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
              {expectedColumns.join(", ")}
            </div>
            {sampleDownloadPath && (
              <button
                onClick={downloadSample}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline"
              >
                <Download className="h-3 w-3" />
                Tải file mẫu
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">File CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setDryReport(null);
              }}
              className="w-full text-sm"
            />
          </div>

          {file && !dryReport && (
            <button
              onClick={runDryRun}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              {busy ? "Đang kiểm tra..." : "Preview (dry-run)"}
            </button>
          )}

          {dryReport && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Tổng" value={dryReport.totalRows} />
                <Stat
                  label="Hợp lệ"
                  value={dryReport.totalRows - dryReport.errors.length}
                  color="emerald"
                />
                <Stat label="Lỗi" value={dryReport.errors.length} color="rose" />
                <Stat label="Bỏ qua" value={dryReport.skipped} />
              </div>

              {dryReport.errors.length > 0 && (
                <div className="text-xs rounded border border-rose-200 bg-rose-50 p-2 max-h-40 overflow-y-auto">
                  <div className="font-medium text-rose-700 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Lỗi cần sửa:
                  </div>
                  <ul className="space-y-0.5 text-rose-700">
                    {dryReport.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        Dòng {e.row}: {e.reason}
                      </li>
                    ))}
                    {dryReport.errors.length > 20 && (
                      <li className="text-rose-500">
                        …{dryReport.errors.length - 20} lỗi khác
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {dryReport.preview && dryReport.preview.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-700 mb-1">
                    Preview ({dryReport.preview.length} dòng đầu):
                  </div>
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {Object.keys(dryReport.preview[0]).map((h) => (
                            <th
                              key={h}
                              className="text-left px-2 py-1 font-medium text-slate-600 border-b border-slate-200"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dryReport.preview.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-2 py-1 text-slate-700 truncate max-w-[160px]">
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 border-t border-slate-200 px-4 py-3 shrink-0">
          <div className="text-xs text-slate-500">
            {dryReport
              ? dryReport.errors.length === 0
                ? "Sẵn sàng import. Nhấn 'Xác nhận import' để ghi dữ liệu."
                : "Sửa lỗi rồi upload lại. Các dòng lỗi sẽ bị bỏ qua nếu import bây giờ."
              : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Huỷ
            </button>
            {dryReport && (
              <button
                onClick={runCommit}
                disabled={busy || dryReport.totalRows - dryReport.errors.length === 0}
                className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Đang import..." : "Xác nhận import"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "emerald" | "rose";
}) {
  const clr =
    color === "emerald"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : color === "rose"
        ? "text-rose-700 bg-rose-50 border-rose-200"
        : "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <div className={`rounded border px-2 py-1.5 ${clr}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
