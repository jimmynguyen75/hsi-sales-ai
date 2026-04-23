import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Search, Upload, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { formatVND } from "@/lib/format";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { useAuth } from "@/hooks/useAuth";

const VENDORS = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft", "Other"];
const CATEGORIES = ["server", "storage", "networking", "security", "cloud", "software", "service"];
const UNITS = ["unit", "license", "month", "year"];

type ProductPayload = Omit<Product, "id" | "createdAt" | "active">;

export function ProductCatalog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  // Form state: null = closed, {} = open in create mode, Product = open in edit mode.
  const [formState, setFormState] = useState<Product | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", vendor, query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (vendor) params.set("vendor", vendor);
      if (query) params.set("q", query);
      return api.get<Product[]>(`/products?${params.toString()}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (p: ProductPayload) => api.post<Product>("/products", p),
    onSuccess: () => {
      setFormState(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductPayload }) =>
      api.put<Product>(`/products/${id}`, patch),
    onSuccess: () => {
      setFormState(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const editing = formState !== null && formState !== "new" ? formState : null;
  const formOpen = formState !== null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/quotations"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quotations
          </Link>
          <h1 className="text-xl font-semibold mt-1">Product Catalog</h1>
          <p className="text-sm text-slate-500">
            Sản phẩm & giá tham khảo để dùng trong quotation.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          )}
          <Button onClick={() => setFormState("new")}>
            <Plus className="h-4 w-4" />
            Sản phẩm mới
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên / SKU..."
            className="pl-9"
          />
        </div>
        <select
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">Tất cả vendor</option>
          {VENDORS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {formOpen && (
        <ProductForm
          initial={editing}
          onSubmit={(p) => {
            if (editing) updateMut.mutate({ id: editing.id, patch: p });
            else createMut.mutate(p);
          }}
          onCancel={() => setFormState(null)}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}

      <Card>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Vendor</th>
                <th className="text-left px-3 py-2 font-medium">SKU</th>
                <th className="text-left px-3 py-2 font-medium">Tên</th>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-right px-3 py-2 font-medium">List Price</th>
                <th className="text-right px-3 py-2 font-medium">Unit</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!isLoading && (products?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                    Chưa có sản phẩm. Bấm "Sản phẩm mới" để thêm.
                  </td>
                </tr>
              )}
              {(products ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Badge className="bg-slate-100 text-slate-700">{p.vendor}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{p.sku || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-slate-500 line-clamp-1">{p.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{p.category ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {formatVND(p.listPrice)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">{p.unit}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <button
                          onClick={() => setFormState(p)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => {
                            if (confirm(`Xoá "${p.name}"?`)) delMut.mutate(p.id);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {importOpen && (
        <BulkImportDialog
          title="Import products từ CSV"
          endpoint="/import/products"
          sampleDownloadPath="/import/sample/products.csv"
          expectedColumns={[
            "vendor",
            "sku",
            "name",
            "description",
            "category",
            "unit",
            "listPrice",
            "partnerCost",
            "currency",
          ]}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            qc.invalidateQueries({ queryKey: ["products"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * ProductForm — shared create/edit form. `initial` seeds fields for edit;
 * passing null/undefined keeps defaults for a fresh record.
 */
function ProductForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: Product | null;
  onSubmit: (p: ProductPayload) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const editing = !!initial;
  const [form, setForm] = useState<ProductPayload>({
    vendor: "HPE",
    sku: null,
    name: "",
    description: null,
    category: "server",
    unit: "unit",
    listPrice: 0,
    partnerCost: null,
    currency: "VND",
  });

  useEffect(() => {
    if (initial) {
      setForm({
        vendor: initial.vendor,
        sku: initial.sku,
        name: initial.name,
        description: initial.description,
        category: initial.category,
        unit: initial.unit,
        listPrice: initial.listPrice,
        partnerCost: initial.partnerCost,
        currency: initial.currency,
      });
    }
  }, [initial]);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="text-sm font-semibold">
          {editing ? `Sửa: ${initial?.name}` : "Sản phẩm mới"}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label>Vendor</Label>
            <select
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>SKU</Label>
            <Input
              value={form.sku ?? ""}
              onChange={(e) => setForm({ ...form, sku: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={form.category ?? "server"}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Unit</Label>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Tên sản phẩm *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: HPE ProLiant DL380 Gen11"
          />
        </div>
        <div>
          <Label>Mô tả</Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value || null })}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>List Price (VND)</Label>
            <Input
              type="number"
              min={0}
              value={form.listPrice}
              onChange={(e) => setForm({ ...form, listPrice: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>Partner Cost (optional)</Label>
            <Input
              type="number"
              min={0}
              value={form.partnerCost ?? 0}
              onChange={(e) =>
                setForm({ ...form, partnerCost: Number(e.target.value) || null })
              }
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            size="sm"
            loading={loading}
            disabled={!form.name.trim() || form.listPrice <= 0}
            onClick={() => onSubmit(form)}
          >
            {editing ? "Lưu thay đổi" : "Lưu"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
