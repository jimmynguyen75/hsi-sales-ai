import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  Printer,
  Search,
  FileDown,
  FileText,
  FileSpreadsheet,
  Building2,
} from "lucide-react";
import { api, downloadFile } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Account, Product, Quotation, QuotationLineItem } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { formatDate, formatVND } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
  expired: "bg-slate-200 text-slate-600",
};

function newLineId() {
  return Math.random().toString(36).slice(2, 10);
}

export function QuotationDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [aiReq, setAiReq] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  // Two PDF variants: "full" with prices, "customer" qty-only review.
  // Track which one is in flight so only the matching button spins.
  const [downloadingPdf, setDownloadingPdf] = useState<"full" | "customer" | null>(
    null,
  );
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  // Tracks which language download is in flight so we can spin the right
  // button. null = idle.
  const [downloadingXlsx, setDownloadingXlsx] = useState<"vi" | "en" | null>(null);

  // Local state for free-text fields so typing isn't interrupted by the
  // invalidate-on-success refetch that saveMut triggers. Each field syncs
  // back to the server on blur.
  const [localTitle, setLocalTitle] = useState("");
  const [localValidUntil, setLocalValidUntil] = useState("");
  const [localNotes, setLocalNotes] = useState("");

  const { data: q, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => api.get<Quotation>(`/quotations/${id}`),
    enabled: !!id,
  });

  // Pull free-text fields into local state whenever the server payload
  // changes (initial load + after our own saves). Comparing the field
  // value avoids resetting while the user is still typing.
  useEffect(() => {
    if (!q) return;
    setLocalTitle((cur) => (cur === q.title || cur === "" ? q.title : cur));
    setLocalValidUntil((cur) => {
      const next = q.validUntil ? q.validUntil.slice(0, 10) : "";
      return cur === next || cur === "" ? next : cur;
    });
    setLocalNotes((cur) => (cur === (q.notes ?? "") || cur === "" ? q.notes ?? "" : cur));
  }, [q?.id, q?.title, q?.validUntil, q?.notes]); // re-sync if server values change

  const saveMut = useMutation({
    mutationFn: (data: Partial<Quotation>) => api.put<Quotation>(`/quotations/${id}`, data),
    // Write the server's response straight into the query cache instead of
    // invalidating. invalidateQueries triggers a refetch that overwrites
    // the local input value mid-keystroke; setQueryData updates without
    // remounting inputs, so typing stays smooth.
    onSuccess: (updated) => {
      qc.setQueryData(["quotation", id], updated);
    },
  });

  const aiMut = useMutation({
    mutationFn: (requirement: string) =>
      api.post<{ quotation: Quotation; added: number }>(`/quotations/${id}/ai/suggest`, {
        requirement,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotation", id] });
      setAiReq("");
      setShowAi(false);
    },
  });

  const delMut = useMutation({
    mutationFn: () => api.del(`/quotations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      nav("/quotations");
    },
  });

  // ---------------------------------------------------------------------
  // Local items mirror + debounced save so per-keystroke edits don't fire
  // a roundtrip each time. We keep a copy of q.items in state, write to it
  // immediately on every edit, and flush to the server 600ms after the
  // last change. Server response writes back via setQueryData (above),
  // which re-renders without remounting the inputs.
  // ---------------------------------------------------------------------
  const [localItems, setLocalItems] = useState<QuotationLineItem[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Re-sync the mirror whenever the server payload changes — but skip
  // sync if we have unsaved local edits (so a save round-trip doesn't
  // step on whatever the user is currently typing).
  useEffect(() => {
    if (!q) return;
    if (dirtyRef.current) return;
    setLocalItems(q.items);
  }, [q?.id, q?.items]);

  function flushItemsNow(items: QuotationLineItem[]) {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    dirtyRef.current = false;
    saveMut.mutate({ items });
  }

  function scheduleItemFlush(items: QuotationLineItem[]) {
    dirtyRef.current = true;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => flushItemsNow(items), 600);
  }

  // Cancel any pending debounced save when the component unmounts.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  if (isLoading || !q) return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;

  function updateItem(itemId: string, patch: Partial<QuotationLineItem>) {
    if (!q) return;
    const items = localItems.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    setLocalItems(items);
    scheduleItemFlush(items);
  }

  // Add/remove are structural changes — flush immediately so the row
  // appears/disappears without waiting for the 600ms debounce.
  function removeItem(itemId: string) {
    const items = localItems.filter((it) => it.id !== itemId);
    setLocalItems(items);
    flushItemsNow(items);
  }

  function addBlankItem() {
    const newItem: QuotationLineItem = {
      id: newLineId(),
      name: "",
      qty: 1,
      unitPrice: 0,
      margin: 0,
      vatPct: 10,
      discount: 0,
      unit: "unit",
      lineTotal: 0,
    };
    const items = [...localItems, newItem];
    setLocalItems(items);
    flushItemsNow(items);
  }

  function addFromProduct(p: Product) {
    // From the catalog: seed Đơn giá from partnerCost (the actual cost to
    // HPT) when available, falling back to listPrice. Margin starts at 0
    // — sales rep types the markup they want.
    const baseUnit = p.partnerCost != null && p.partnerCost > 0 ? p.partnerCost : p.listPrice;
    const newItem: QuotationLineItem = {
      id: newLineId(),
      productId: p.id,
      name: p.name,
      description: p.description ?? undefined,
      vendor: p.vendor,
      qty: 1,
      unitPrice: baseUnit,
      margin: 0,
      vatPct: 10,
      discount: 0,
      unit: p.unit,
      lineTotal: 0,
    };
    const items = [...localItems, newItem];
    setLocalItems(items);
    flushItemsNow(items);
    setShowPicker(false);
  }

  return (
    <div className="p-6 space-y-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/quotations"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quotations
        </Link>
        <div className="flex gap-2">
          {/* PDF (Có giá) — full quote with prices, VAT, totals. What goes
              to the customer after pricing is final. */}
          <Button
            variant="outline"
            size="sm"
            loading={downloadingPdf === "full"}
            disabled={!!downloadingPdf || q.items.length === 0}
            title="PDF báo giá đầy đủ — có giá, VAT, tổng cộng"
            onClick={async () => {
              if (!q) return;
              setDownloadingPdf("full");
              try {
                await downloadFile(
                  `/quotations/${q.id}/export.pdf?mode=full`,
                  `${q.number}.pdf`,
                );
                toast.success("Đã tải PDF (Có giá)");
              } catch (err) {
                toast.error(
                  "Tải PDF thất bại",
                  err instanceof Error ? err.message : String(err),
                );
              } finally {
                setDownloadingPdf(null);
              }
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF (Có giá)
          </Button>
          {/* PDF (Không giá) — qty-only review version. Customer xác nhận
              số lượng before HPT quotes a price. */}
          <Button
            variant="outline"
            size="sm"
            loading={downloadingPdf === "customer"}
            disabled={!!downloadingPdf || q.items.length === 0}
            title="PDF không có giá — gửi khách hàng xác nhận số lượng trước khi chốt giá"
            onClick={async () => {
              if (!q) return;
              setDownloadingPdf("customer");
              try {
                await downloadFile(
                  `/quotations/${q.id}/export.pdf?mode=customer`,
                  `${q.number}-customer-review.pdf`,
                );
                toast.success("Đã tải PDF (Không giá)");
              } catch (err) {
                toast.error(
                  "Tải PDF thất bại",
                  err instanceof Error ? err.message : String(err),
                );
              } finally {
                setDownloadingPdf(null);
              }
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF (Không giá)
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={downloadingDocx}
            disabled={downloadingDocx || q.items.length === 0}
            onClick={async () => {
              if (!q) return;
              setDownloadingDocx(true);
              try {
                await downloadFile(`/quotations/${q.id}/export.docx`, `${q.number}.docx`);
                toast.success("Đã tải DOCX");
              } catch (err) {
                toast.error("Tải DOCX thất bại", err instanceof Error ? err.message : String(err));
              } finally {
                setDownloadingDocx(false);
              }
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            DOCX
          </Button>
          {/* Two XLSX buttons — Vietnamese and English locales. Labels, T&C
              wording, and the number-to-words line all switch based on the
              lang query param the server reads. */}
          <Button
            variant="outline"
            size="sm"
            loading={downloadingXlsx === "vi"}
            disabled={!!downloadingXlsx || q.items.length === 0}
            title="Xuất Excel — tiếng Việt"
            onClick={async () => {
              if (!q) return;
              setDownloadingXlsx("vi");
              try {
                await downloadFile(
                  `/quotations/${q.id}/export.xlsx?lang=vi`,
                  `${q.number}-VI.xlsx`,
                );
                toast.success("Đã tải XLSX (Tiếng Việt)");
              } catch (err) {
                toast.error("Tải XLSX thất bại", err instanceof Error ? err.message : String(err));
              } finally {
                setDownloadingXlsx(null);
              }
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            XLSX (VI)
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={downloadingXlsx === "en"}
            disabled={!!downloadingXlsx || q.items.length === 0}
            title="Export Excel — English"
            onClick={async () => {
              if (!q) return;
              setDownloadingXlsx("en");
              try {
                await downloadFile(
                  `/quotations/${q.id}/export.xlsx?lang=en`,
                  `${q.number}-EN.xlsx`,
                );
                toast.success("Đã tải XLSX (English)");
              } catch (err) {
                toast.error("Tải XLSX thất bại", err instanceof Error ? err.message : String(err));
              } finally {
                setDownloadingXlsx(null);
              }
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            XLSX (EN)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm("Xoá quotation này?")) delMut.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">{q.number}</div>
              {/* Title is locally controlled — saves only on blur so the
                  query-invalidation refetch can't yank characters out from
                  under the keystroke. */}
              <Input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={() => {
                  if (localTitle !== q.title) saveMut.mutate({ title: localTitle });
                }}
                placeholder="Tên báo giá..."
                className="text-lg font-semibold border-0 px-0 focus:ring-0 focus:border-0"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge className={STATUS_COLOR[q.status] ?? "bg-slate-100 text-slate-700"}>
                  {q.status}
                </Badge>
                {/* Account selector — quotation can be (re)linked to any of
                    the rep's accounts. Empty option clears the link. Saves
                    immediately on change since it's a discrete action. */}
                <AccountPicker
                  currentAccountId={q.accountId ?? null}
                  onChange={(id) => saveMut.mutate({ accountId: id })}
                />
                {/* Inline date input — same blur-to-save pattern. Empty
                    string clears the value (sent as null). */}
                <label className="inline-flex items-center gap-1 text-slate-500">
                  Hết hạn:
                  <input
                    type="date"
                    value={localValidUntil}
                    onChange={(e) => setLocalValidUntil(e.target.value)}
                    onBlur={() => {
                      const next = localValidUntil
                        ? new Date(localValidUntil).toISOString()
                        : null;
                      if (next !== (q.validUntil ?? null)) {
                        saveMut.mutate({ validUntil: next });
                      }
                    }}
                    className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              </div>
            </div>
            <div className="print:hidden">
              <select
                value={q.status}
                onChange={(e) =>
                  saveMut.mutate({ status: e.target.value as Quotation["status"] })
                }
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="draft">draft</option>
                <option value="sent">sent</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
                <option value="expired">expired</option>
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={addBlankItem}>
          <Plus className="h-3.5 w-3.5" />
          Line trống
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
          <Search className="h-3.5 w-3.5" />
          Từ catalog
        </Button>
        <Button size="sm" variant="primary" onClick={() => setShowAi(true)}>
          <Sparkles className="h-3.5 w-3.5" />
          AI gợi ý BOM
        </Button>
      </div>

      {showAi && (
        <Card className="print:hidden">
          <CardBody className="space-y-2">
            <Label>Mô tả yêu cầu — AI sẽ gợi ý line items</Label>
            <Textarea
              value={aiReq}
              onChange={(e) => setAiReq(e.target.value)}
              rows={4}
              placeholder="VD: HCI cluster 6 node cho core banking, 500 user M365 E5, firewall PA-5220 HA pair, backup 100TB..."
            />
            {aiMut.error && (
              <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {(aiMut.error as Error).message}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAi(false)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                loading={aiMut.isPending}
                disabled={!aiReq.trim()}
                onClick={() => aiMut.mutate(aiReq)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Gợi ý & thêm
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {showPicker && <ProductPicker onPick={addFromProduct} onClose={() => setShowPicker(false)} />}

      <Card className="print:border-0 print:shadow-none">
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium w-1/3">Sản phẩm / mô tả</th>
                <th className="text-left px-3 py-2 font-medium">Vendor</th>
                <th className="text-right px-3 py-2 font-medium">SL</th>
                <th className="text-right px-3 py-2 font-medium">Đơn giá</th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Markup. Đơn giá sau margin = Đơn giá × (1 + margin%)."
                >
                  Margin %
                </th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Pre-VAT total = SL × Đơn giá × (1 + margin%)"
                >
                  Thành tiền
                </th>
                <th className="text-right px-3 py-2 font-medium">VAT %</th>
                <th className="text-right px-3 py-2 font-medium">VAT</th>
                <th className="print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {localItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-400">
                    Chưa có line item. Thêm từ catalog hoặc để AI gợi ý.
                  </td>
                </tr>
              )}
              {localItems.map((it, idx) => (
                <tr key={it.id} className="align-top">
                  <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      placeholder="Tên sản phẩm"
                      className="w-full text-sm font-medium text-slate-800 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                    <input
                      value={it.description ?? ""}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                      placeholder="Mô tả ngắn..."
                      className="w-full text-xs text-slate-500 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.vendor ?? ""}
                      onChange={(e) => updateItem(it.id, { vendor: e.target.value })}
                      className="w-20 text-xs bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) || 0 })}
                      className="w-16 text-right bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                    <div className="text-[10px] text-slate-400">{it.unit ?? "unit"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Đơn giá = the partner / cost price the rep types in.
                        Markup is the separate Margin column. */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.unitPrice ? it.unitPrice.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d]/g, "");
                        updateItem(it.id, {
                          unitPrice: cleaned ? parseInt(cleaned, 10) : 0,
                        });
                      }}
                      placeholder="0"
                      className="w-36 text-right tabular-nums bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Gross margin %. Editing margin updates Đơn giá in
                        place — the implicit cost stays put:
                          cost          = currentUnit × (1 - oldMargin/100)
                          newUnit       = cost / (1 - newMargin/100)
                        That way the "margin %" column directly drives the
                        Đơn giá number; Thành tiền = qty × Đơn giá visibly. */}
                    {(() => {
                      const margin = it.margin ?? 0;
                      const color =
                        margin >= 20
                          ? "text-emerald-700"
                          : margin >= 10
                            ? "text-amber-700"
                            : margin >= 0
                              ? "text-orange-700"
                              : "text-rose-700";
                      const applyMargin = (newMargin: number) => {
                        const oldMargin = it.margin ?? 0;
                        // Back out the implicit cost from the current sell
                        // price + old margin, then re-price under the new
                        // margin. Defensive divisor check below.
                        const implicitCost = Math.round(
                          it.unitPrice * (1 - oldMargin / 100),
                        );
                        const divisor = 1 - newMargin / 100;
                        const newUnit =
                          divisor > 0.0001
                            ? Math.round(implicitCost / divisor)
                            : it.unitPrice;
                        updateItem(it.id, {
                          margin: newMargin,
                          unitPrice: newUnit,
                        });
                      };
                      return (
                        <div className="inline-flex items-center gap-0.5 justify-end">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              it.margin == null || it.margin === 0
                                ? ""
                                : margin.toString()
                            }
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(
                                /[^\d.\-]/g,
                                "",
                              );
                              if (cleaned === "" || cleaned === "-" || cleaned === ".") {
                                applyMargin(0);
                                return;
                              }
                              const m = parseFloat(cleaned);
                              if (Number.isNaN(m)) return;
                              if (m >= 100) return; // sell would diverge
                              if (m <= -1000) return; // sanity bound
                              applyMargin(m);
                            }}
                            placeholder="0"
                            title="Gross margin %. Khi gõ, Đơn giá tự cập nhật để cộng đúng margin% lên cost ngầm định. Thành tiền = SL × Đơn giá."
                            className={`w-14 text-right tabular-nums text-sm font-medium bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 ${color}`}
                          />
                          <span className={`text-sm ${color}`}>%</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
                    {formatVND(it.lineTotal)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Per-row VAT %. Editable. Common values: 0 (software),
                        8 (preferential), 10 (default hardware). */}
                    <div className="inline-flex items-center gap-0.5 justify-end">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          it.vatPct == null || it.vatPct === 0
                            ? it.vatPct === 0
                              ? "0"
                              : ""
                            : it.vatPct.toString()
                        }
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^\d.]/g, "");
                          if (cleaned === "" || cleaned === ".") {
                            updateItem(it.id, { vatPct: 0 });
                            return;
                          }
                          const v = parseFloat(cleaned);
                          if (Number.isNaN(v) || v < 0 || v > 100) return;
                          updateItem(it.id, { vatPct: v });
                        }}
                        placeholder="10"
                        title="VAT % cho dòng này"
                        className="w-12 text-right tabular-nums text-sm bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5"
                      />
                      <span className="text-sm text-slate-500">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">
                    {/* VAT amount = lineTotal × vatPct/100. Read-only;
                        backend computes via recompute() and returns lineVAT. */}
                    {formatVND(
                      it.lineVAT ??
                        Math.round((it.lineTotal * (it.vatPct ?? 0)) / 100),
                    )}
                  </td>
                  <td className="px-3 py-2 print:hidden">
                    <button
                      onClick={() => removeItem(it.id)}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
        <Card className="print:border-0 print:shadow-none">
          <CardBody>
            <Label>Ghi chú / Terms</Label>
            <Textarea
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={() => {
                if (localNotes !== (q.notes ?? "")) {
                  saveMut.mutate({ notes: localNotes });
                }
              }}
              rows={5}
              placeholder="Payment terms, delivery, warranty, assumption..."
            />
          </CardBody>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardBody className="space-y-2 text-sm">
            {/* Currency + exchange rate. VND is the default and hides the
                exchange-rate input. USD/EUR show it so reps can quote a
                foreign vendor price and let the system show the converted
                Tổng VND. */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">Tiền tệ</span>
                <select
                  value={q.currency}
                  onChange={(e) => saveMut.mutate({ currency: e.target.value })}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="VND">VND (₫)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </label>
              {q.currency !== "VND" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-500">
                    Tỷ giá → VND
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={q.exchangeRate ?? ""}
                    onChange={(e) =>
                      saveMut.mutate({
                        exchangeRate: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="VD: 25,430"
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100" />

            {/* Subtotal = Σ lineTotal (pre-VAT). VAT is per-row now, so the
                aggregate VAT here is just the sum of each row's VAT amount.
                Tổng cộng = subtotal + total VAT. */}
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal (chưa VAT)</span>
              <span className="font-medium tabular-nums">
                {q.subtotal.toLocaleString("vi-VN")} {q.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT</span>
              <span className="font-medium tabular-nums">
                {Math.max(0, q.total - q.subtotal).toLocaleString("vi-VN")} {q.currency}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
              <span className="font-semibold">Tổng cộng</span>
              <span className="font-bold text-brand-700 tabular-nums">
                {q.total.toLocaleString("vi-VN")} {q.currency}
              </span>
            </div>
            {/* Converted VND total when currency is foreign. Only shown when
                we have an exchange rate; otherwise prompt the rep to enter
                one so the customer can see the converted amount. */}
            {q.currency !== "VND" && (
              <div className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-xs">
                {q.exchangeRate && q.exchangeRate > 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">
                      Quy đổi VND @ {q.exchangeRate.toLocaleString("vi-VN")}
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {Math.round(q.total * q.exchangeRate).toLocaleString("vi-VN")} ₫
                    </span>
                  </div>
                ) : (
                  <span className="italic text-slate-400">
                    Nhập tỷ giá để hiển thị giá quy đổi VND.
                  </span>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ProductPicker({
  onPick,
  onClose,
}: {
  onPick: (p: Product) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products", vendor, query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (vendor) params.set("vendor", vendor);
      if (query) params.set("q", query);
      return api.get<Product[]>(`/products?${params.toString()}`);
    },
  });

  const vendors = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => set.add(p.vendor));
    return Array.from(set);
  }, [products]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Chọn từ catalog</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên / SKU..."
              className="flex-1"
            />
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Tất cả vendor</option>
              {["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft", ...vendors]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            {(products ?? []).length === 0 && (
              <div className="text-sm text-slate-400 py-8 text-center">
                Chưa có sản phẩm. Thêm ở trang Catalog trước.
              </div>
            )}
            {(products ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="w-full text-left flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40 transition"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 line-clamp-1">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.vendor}
                    {p.sku ? ` · ${p.sku}` : ""}
                    {p.category ? ` · ${p.category}` : ""}
                  </div>
                </div>
                <div className="text-sm font-medium whitespace-nowrap">
                  {formatVND(p.listPrice)}/{p.unit}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AccountPicker — small inline dropdown that lets the sales rep link the
 * quotation to one of their accounts (or unlink it). Lazy-loads the list
 * the first time the picker opens, then keeps it cached.
 */
function AccountPicker({
  currentAccountId,
  onChange,
}: {
  currentAccountId: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: accounts } = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: () => api.get<Account[]>("/accounts"),
  });
  const current = accounts?.find((a) => a.id === currentAccountId);
  return (
    <label className="inline-flex items-center gap-1 text-slate-500">
      <Building2 className="h-3 w-3" />
      Khách hàng:
      <select
        value={currentAccountId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[200px]"
        title={current?.companyName ?? "Chưa gắn account"}
      >
        <option value="">— Chưa gắn —</option>
        {(accounts ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.companyName}
          </option>
        ))}
      </select>
    </label>
  );
}
