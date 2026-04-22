import { Sparkles } from "lucide-react";

export function ComingSoon({ module }: { module: string }) {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-brand-500" />
        <h2 className="mt-3 text-lg font-semibold">{module}</h2>
        <p className="mt-1 text-sm text-slate-600">Module này sẽ có trong Phase tiếp theo.</p>
        <p className="mt-4 text-xs text-slate-500">
          Phase hiện tại: Module 1 — Smart CRM Assistant đã sẵn sàng.
        </p>
      </div>
    </div>
  );
}
