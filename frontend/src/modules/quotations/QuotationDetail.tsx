import { useMemo, useState } from "react";
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
} from "lucide-react";
import { api, downloadFile } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Product, Quotation, QuotationLineItem } from "@/lib/types";
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  const { data: q, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => api.get<Quotation>(`/quotations/${id}`),
    enabled: !!id,
  });

  const saveMut = useMutation({
    mutationFn: (data: Partial<Quotation>) => api.put<Quotation>(`/quotations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotation", id] }),
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

  if (isLoading || !q) return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;

  function updateItem(itemId: string, patch: Partial<QuotationLineItem>) {
    if (!q) return;
    const items = q.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    saveMut.mutate({ items });
  }

  function removeItem(itemId: string) {
    if (!q) return;
    saveMut.mutate({ items: q.items.filter((it) => it.id !== itemId) });
  }

  function addBlankItem() {
    if (!q) return;
    const newItem: QuotationLineItem = {
      id: newLineId(),
      name: "",
      qty: 1,
      unitPrice: 0,
      discount: 0,
      unit: "unit",
      lineTotal: 0,
    };
    saveMut.mutate({ items: [...q.items, newItem] });
  }

  function addFromProduct(p: Product) {
    if (!q) return;
    const newItem: QuotationLineItem = {
      id: newLineId(),
      productId: p.id,
      name: p.name,
      description: p.description ?? undefined,
      vendor: p.vendor,
      qty: 1,
      unitPrice: p.listPrice,
      discount: 0,
      unit: p.unit,
      lineTotal: 0,
    };
    saveMut.mutate({ items: [...q.items, newItem] });
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
          <Button
            variant="outline"
            size="sm"
            loading={downloadingPdf}
            disabled={downloadingPdf || q.items.length === 0}
            onClick={async () => {
              if (!q) return;
              setDownloadingPdf(true);
              try {
                await downloadFile(`/quotations/${q.id}/export.pdf`, `${q.number}.pdf`);
                toast.success("Đã tải PDF");
              } catch (err) {
                toast.error("Tải PDF thất bại", err instanceof Error ? err.message : String(err));
              } finally {
                setDownloadingPdf(false);
              }
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
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
              <Input
                value={q.title}
                onChange={(e) => saveMut.mutate({ title: e.target.value })}
                className="text-lg font-semibold border-0 px-0 focus:ring-0 focus:border-0"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge className={STATUS_COLOR[q.status] ?? "bg-slate-100 text-slate-700"}>
                  {q.status}
                </Badge>
                {q.validUntil && (
                  <span className="text-slate-500">Hết hạn: {formatDate(q.validUntil)}</span>
                )}
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
                <th className="text-right px-3 py-2 font-medium">% CK</th>
                <th className="text-right px-3 py-2 font-medium">Thành tiền</th>
                <th className="print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                    Chưa có line item. Thêm từ catalog hoặc để AI gợi ý.
                  </td>
                </tr>
              )}
              {q.items.map((it, idx) => (
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
                    <input
                      type="number"
                      min={0}
                      value={it.unitPrice}
                      onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                      className="w-32 text-right bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={it.discount}
                      onChange={(e) => updateItem(it.id, { discount: Number(e.target.value) || 0 })}
                      className="w-14 text-right bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
                    {formatVND(it.lineTotal)}
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
              value={q.notes ?? ""}
              onChange={(e) => saveMut.mutate({ notes: e.target.value })}
              rows={5}
              placeholder="Payment terms, delivery, warranty, assumption..."
            />
          </CardBody>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium">{formatVND(q.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Chiết khấu tổng (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={q.discount}
                onChange={(e) => saveMut.mutate({ discount: Number(e.target.value) || 0 })}
                className="w-16 text-right border border-slate-200 rounded px-2 py-0.5 text-sm print:border-0"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">VAT (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={q.tax}
                onChange={(e) => saveMut.mutate({ tax: Number(e.target.value) || 0 })}
                className="w-16 text-right border border-slate-200 rounded px-2 py-0.5 text-sm print:border-0"
              />
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
              <span className="font-semibold">Tổng cộng</span>
              <span className="font-bold text-brand-700">{formatVND(q.total)}</span>
            </div>
            <div className="text-[11px] text-slate-400">{q.currency}</div>
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
