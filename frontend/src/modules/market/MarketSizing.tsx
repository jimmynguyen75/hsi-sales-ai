import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Sparkles,
  Trash2,
  MapPin,
  Layers,
  Calendar,
  History,
  Lightbulb,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { MarketSizing as MS } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { formatVND, relativeTime } from "@/lib/format";

type MSSummary = Pick<
  MS,
  "id" | "title" | "segment" | "region" | "vertical" | "tam" | "sam" | "som" | "createdAt"
>;

interface FormState {
  title?: string;
  segment: string;
  region: string;
  vertical?: string;
  productCategory?: string;
  timeframe?: string;
  notes?: string;
}

const VERTICALS = ["finance", "manufacturing", "retail", "government", "healthcare", "telecom", "education"];
const CATEGORIES = ["server", "storage", "networking", "security", "cloud", "software", "service"];

export function MarketSizing() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    segment: "",
    region: "Vietnam",
    timeframe: "2025-2026",
  });
  const [viewing, setViewing] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ["market"],
    queryFn: () => api.get<MSSummary[]>("/market"),
  });

  const { data: detail } = useQuery({
    queryKey: ["market", viewing],
    queryFn: () => api.get<MS>(`/market/${viewing}`),
    enabled: !!viewing,
  });

  const analyzeMut = useMutation({
    mutationFn: (body: FormState) => api.post<MS>("/market/analyze", body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["market"] });
      setViewing(r.id);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/market/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market"] });
      if (viewing) setViewing(null);
    },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-brand-600" />
            Market Sizing
          </h1>
          <p className="text-sm text-slate-500">
            AI ước lượng TAM / SAM / SOM cho segment tại Việt Nam + khuyến nghị GTM cho HSI.
          </p>
        </div>
        {viewing && (
          <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>
            Về form
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {!viewing && (
            <Card>
              <CardBody>
                <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Thông số đầu vào
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="segment">Segment *</Label>
                    <Input
                      id="segment"
                      placeholder="VD: Enterprise Cybersecurity, Data Center Storage, Endpoint Protection..."
                      value={form.segment}
                      onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="region">Region *</Label>
                    <Input
                      id="region"
                      placeholder="Vietnam, HCMC, Hanoi..."
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vertical">Vertical</Label>
                    <select
                      id="vertical"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={form.vertical ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, vertical: e.target.value || undefined })
                      }
                    >
                      <option value="">— Tất cả —</option>
                      {VERTICALS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cat">Product category</Label>
                    <select
                      id="cat"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={form.productCategory ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, productCategory: e.target.value || undefined })
                      }
                    >
                      <option value="">— Tất cả —</option>
                      {CATEGORIES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="tf">Timeframe</Label>
                    <Input
                      id="tf"
                      value={form.timeframe ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, timeframe: e.target.value || undefined })
                      }
                      placeholder="2025-2026"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="notes">Notes / Assumptions</Label>
                    <Textarea
                      id="notes"
                      rows={2}
                      value={form.notes ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value || undefined })
                      }
                      placeholder="Giới hạn chỉ mid-market trở lên, focus khu công nghiệp phía Nam..."
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button
                    loading={analyzeMut.isPending}
                    disabled={!form.segment.trim() || !form.region.trim()}
                    onClick={() => analyzeMut.mutate(form)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI ước lượng
                  </Button>
                </div>
                {analyzeMut.error && (
                  <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {(analyzeMut.error as Error).message}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {viewing && detail && <MarketDetail m={detail} onDelete={() => delMut.mutate(detail.id)} />}
          {viewing && !detail && (
            <Card>
              <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
            </Card>
          )}
        </div>

        <aside className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 px-1 flex items-center gap-1">
            <History className="h-3 w-3" />
            Lịch sử ({list?.length ?? 0})
          </div>
          {(list ?? []).length === 0 && (
            <div className="text-xs text-slate-400 italic px-1">Chưa có phân tích.</div>
          )}
          {(list ?? []).map((m) => (
            <button
              key={m.id}
              onClick={() => setViewing(m.id)}
              className={
                "w-full text-left rounded-lg border px-3 py-2 transition " +
                (viewing === m.id
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <div className="text-sm font-medium text-slate-800 line-clamp-2">{m.title}</div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                <MapPin className="h-3 w-3" />
                {m.region}
                {m.vertical && ` · ${m.vertical}`}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                TAM {formatVND(m.tam)} · {relativeTime(m.createdAt)}
              </div>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

function MarketDetail({ m, onDelete }: { m: MS; onDelete: () => void }) {
  const maxVal = Math.max(m.tam, m.sam, m.som);
  const tamPct = (m.tam / maxVal) * 100;
  const samPct = (m.sam / maxVal) * 100;
  const somPct = (m.som / maxVal) * 100;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-semibold">{m.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                <Layers className="h-3.5 w-3.5" />
                <span>{m.segment}</span>
                <span>·</span>
                <MapPin className="h-3.5 w-3.5" />
                <span>{m.region}</span>
                {m.vertical && (
                  <>
                    <span>·</span>
                    <Badge className="bg-slate-100 text-slate-700">{m.vertical}</Badge>
                  </>
                )}
                {m.inputs?.timeframe && (
                  <>
                    <span>·</span>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{m.inputs.timeframe}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm("Xóa phân tích này?")) onDelete();
              }}
              className="text-slate-400 hover:text-rose-600"
              title="Xóa"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <SizeBar label="TAM" subtitle="Total Addressable Market" value={m.tam} pct={tamPct} color="bg-brand-500" />
            <SizeBar label="SAM" subtitle="Serviceable Addressable (HSI portfolio)" value={m.sam} pct={samPct} color="bg-indigo-500" />
            <SizeBar label="SOM" subtitle="Serviceable Obtainable (1-3 năm)" value={m.som} pct={somPct} color="bg-emerald-500" />
          </div>

          {m.inputs?.reasoning && (
            <div className="mt-3 text-xs text-slate-600 italic border-l-2 border-slate-200 pl-3">
              {m.inputs.reasoning}
            </div>
          )}
        </CardBody>
      </Card>

      {m.analysis && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Sparkles className="h-4 w-4 text-brand-600" />
              AI phân tích & khuyến nghị
            </div>
            <div className="prose-hsi text-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.analysis}</ReactMarkdown>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {m.inputs?.assumptions && m.inputs.assumptions.length > 0 && (
          <Card>
            <CardBody>
              <div className="text-sm font-semibold mb-2">Assumptions</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                {m.inputs.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        {m.inputs?.drivers && m.inputs.drivers.length > 0 && (
          <Card>
            <CardBody>
              <div className="text-sm font-semibold mb-2">Drivers / Constraints</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                {m.inputs.drivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      {m.inputs?.competitorLandscape && (
        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-2">Competitor landscape</div>
            <div className="text-sm text-slate-700">{m.inputs.competitorLandscape}</div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SizeBar({
  label,
  subtitle,
  value,
  pct,
  color,
}: {
  label: string;
  subtitle: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <span className="text-xs text-slate-500 ml-2">{subtitle}</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">{formatVND(value)}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}
