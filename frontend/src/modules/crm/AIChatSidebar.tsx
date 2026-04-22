import { useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PRESETS = [
  "Tóm tắt account này",
  "Gợi ý email follow-up bằng tiếng Việt",
  "Đánh giá khả năng upsell",
  "Các rủi ro cần chú ý ngay",
];

export function AIChatSidebar({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const r = await api.post<{ reply: string }>(`/accounts/${accountId}/ai/chat`, {
        message: trimmed,
      });
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "**Lỗi:** " + (e instanceof Error ? e.message : "unknown") },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600" />
          <div>
            <div className="text-sm font-semibold">AI Chat</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[220px]">{accountName}</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {messages.length === 0 && (
          <div>
            <div className="text-xs text-slate-500 mb-2">Gợi ý câu hỏi:</div>
            <div className="flex flex-col gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:bg-slate-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"
                : "mr-8 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900"
            }
          >
            {m.role === "user" ? (
              <div className="whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div className="prose-hsi">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-8 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400" />
            <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-slate-200 p-3 flex gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Hỏi AI về account này..."
          className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <Button type="submit" size="sm" loading={loading} disabled={!input.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </aside>
  );
}
