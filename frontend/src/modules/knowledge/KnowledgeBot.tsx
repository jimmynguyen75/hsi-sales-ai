import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bot,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Radar,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { ChatMessage, ChatSession, ChatSessionSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/format";

type RagStatus = { mode: "semantic" | "keyword" | "warming"; ready: boolean; disabled: boolean };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

const SUGGESTED_PROMPTS = [
  "So sánh Palo Alto PA-5450 và Fortinet FortiGate 600F cho doanh nghiệp vừa",
  "HPE Alletra 6000 có gì nổi bật so với Dell PowerStore?",
  "CrowdStrike Falcon có những tier nào? Giá tham khảo?",
  "Microsoft 365 E3 vs E5 — khác biệt cho khách enterprise?",
  "Khi nào nên recommend IBM Storage FlashSystem thay vì HPE?",
];

export function KnowledgeBot() {
  const qc = useQueryClient();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedDelta, setStreamedDelta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get<ChatSessionSummary[]>("/chat/sessions"),
  });

  const { data: ragStatus } = useQuery({
    queryKey: ["rag-status"],
    queryFn: () => api.get<RagStatus>("/chat/rag-status"),
    // Re-check every 30s so "warming" flips to "semantic" once model loads.
    refetchInterval: (q) =>
      (q.state.data as RagStatus | undefined)?.mode === "warming" ? 5000 : 60000,
  });

  const { data: current } = useQuery({
    queryKey: ["chat-session", currentId],
    queryFn: () => api.get<ChatSession>(`/chat/sessions/${currentId}`),
    enabled: !!currentId,
  });

  // Auto-scroll to bottom when messages change or streaming
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [current?.messages?.length, streamedDelta]);

  const createMut = useMutation({
    mutationFn: () => api.post<ChatSession>("/chat/sessions"),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      setCurrentId(s.id);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/chat/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (currentId) setCurrentId(null);
    },
  });

  async function send() {
    if (!input.trim() || streaming) return;

    // Ensure we have a session
    let sessionId = currentId;
    if (!sessionId) {
      const s = await api.post<ChatSession>("/chat/sessions");
      sessionId = s.id;
      setCurrentId(sessionId);
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    }

    const message = input.trim();
    setInput("");
    setError(null);
    setStreaming(true);
    setStreamedDelta("");

    try {
      const token = localStorage.getItem("hsi_token");
      const resp = await fetch(`${API_URL}/chat/sessions/${sessionId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!resp.ok || !resp.body) {
        let errText = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          errText = j.error ?? errText;
        } catch {
          /* ignore */
        }
        throw new Error(errText);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aggregated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // last partial stays in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as {
              delta?: string;
              done?: boolean;
              error?: string;
            };
            if (msg.error) throw new Error(msg.error);
            if (msg.delta) {
              aggregated += msg.delta;
              setStreamedDelta(aggregated);
            }
            if (msg.done) {
              // refetch session to get persisted messages + citations + title
              qc.invalidateQueries({ queryKey: ["chat-session", sessionId] });
              qc.invalidateQueries({ queryKey: ["chat-sessions"] });
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
      setStreamedDelta("");
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const messages: ChatMessage[] = current?.messages ?? [];

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-3 flex flex-col gap-2 overflow-y-auto">
        <Button size="sm" onClick={() => createMut.mutate()} loading={createMut.isPending}>
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Hội thoại mới
        </Button>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-2 px-1">
          Lịch sử
        </div>
        {(sessions ?? []).length === 0 && (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-[11px] text-slate-500 leading-relaxed">
            Gõ câu hỏi đầu tiên vào ô chat — hội thoại sẽ tự lưu tại đây để tham chiếu sau.
          </div>
        )}
        {(sessions ?? []).map((s) => (
          <div key={s.id} className="group relative">
            <button
              onClick={() => setCurrentId(s.id)}
              className={
                "w-full text-left rounded-md border px-3 py-2 transition " +
                (currentId === s.id
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <div className="text-sm font-medium text-slate-800 line-clamp-2 pr-5">
                {s.title}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {relativeTime(s.updatedAt)}
              </div>
            </button>
            <button
              onClick={() => {
                if (confirm("Xóa hội thoại này?")) delMut.mutate(s.id);
              }}
              className="absolute top-2 right-2 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-slate-200 px-5 py-3 bg-white">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            Product Knowledge Chatbot
            {current && (
              <span className="text-sm font-normal text-slate-500">· {current.title}</span>
            )}
            {ragStatus && (
              <span
                className={
                  "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (ragStatus.mode === "semantic"
                    ? "bg-emerald-100 text-emerald-700"
                    : ragStatus.mode === "warming"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600")
                }
                title={
                  ragStatus.mode === "semantic"
                    ? "Semantic search active — embedding model loaded, ranking by meaning"
                    : ragStatus.mode === "warming"
                    ? "Model đang load lần đầu — query đầu tiên sẽ trigger"
                    : "Keyword fallback — model không load được"
                }
              >
                <Radar className="h-3 w-3" />
                {ragStatus.mode === "semantic"
                  ? "Semantic RAG"
                  : ragStatus.mode === "warming"
                  ? "RAG warming..."
                  : "Keyword mode"}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500">
            Hỏi về HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft — AI dùng catalog HSI làm
            context.
          </p>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 bg-slate-50">
          <div className="max-w-[800px] mx-auto space-y-4">
            {messages.length === 0 && !streaming && !streamedDelta && (
              <div className="space-y-3">
                <div className="text-center py-8">
                  <Bot className="h-10 w-10 text-brand-300 mx-auto mb-2" />
                  <div className="text-sm text-slate-500">
                    Bắt đầu bằng một câu hỏi hoặc chọn gợi ý dưới đây.
                  </div>
                </div>
                <div className="grid gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="text-left text-sm rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40 transition"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand-500 inline mr-1.5" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Message key={i} message={m} />
            ))}

            {streaming && streamedDelta && (
              <Message
                message={{
                  role: "assistant",
                  content: streamedDelta,
                  createdAt: new Date().toISOString(),
                }}
                streaming
              />
            )}
            {streaming && !streamedDelta && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="h-3 w-3 rounded-full bg-brand-500 animate-pulse" />
                AI đang suy nghĩ...
              </div>
            )}

            {error && (
              <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="max-w-[800px] mx-auto flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={streaming}
              rows={2}
              placeholder="Hỏi về sản phẩm... (Enter để gửi, Shift+Enter xuống dòng)"
              className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100"
            />
            <Button onClick={send} disabled={!input.trim() || streaming} loading={streaming}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={"flex gap-3 " + (isUser ? "justify-end" : "")}>
      {!isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={
          "max-w-[640px] rounded-lg px-4 py-2.5 " +
          (isUser
            ? "bg-brand-600 text-white"
            : "bg-white border border-slate-200 text-slate-800")
        }
      >
        {isUser ? (
          <div className="text-sm whitespace-pre-line">{message.content}</div>
        ) : (
          <div className="prose-hsi text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content + (streaming ? " ▊" : "")}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
            {message.citations.map((c) => (
              <span
                key={c.id}
                className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5"
                title={c.id}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200 text-slate-700 grid place-items-center">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
