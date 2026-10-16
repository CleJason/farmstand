"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Message = { id: string; phone: string; direction: "IN" | "OUT"; body: string; createdAt: string };
type Thread = { phone: string; name: string | null; last: Message; unread: number };
type Conversation = { phone: string; name: string | null; optedOut: boolean; messages: Message[] };

const pretty = (p: string) => (p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Text inbox: customers' texts to the shop phone, with replies sent back through SMS Gate. */
export default function AdminMessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const unreadShown = useRef<number | null>(null);
  const loadThreads = useCallback(
    () =>
      fetch("/api/messages")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const list: Thread[] = Array.isArray(d) ? d : [];
          setThreads(list);
          // The sidebar's "Messages (n)" comes from the server: refresh it when the unread count changes
          const unread = list.reduce((n, t) => n + t.unread, 0);
          if (unreadShown.current !== unread) router.refresh();
          unreadShown.current = unread;
        })
        .catch(() => {}),
    [router]
  );
  const loadConvo = useCallback(
    (phone: string) =>
      fetch(`/api/messages?phone=${encodeURIComponent(phone)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setConvo(d))
        .catch(() => {}),
    []
  );

  // Check for new texts every 15 seconds while the page is open
  useEffect(() => {
    loadThreads();
    const t = setInterval(() => {
      loadThreads();
      if (open) loadConvo(open);
    }, 15000);
    return () => clearInterval(t);
  }, [open, loadThreads, loadConvo]);

  useEffect(() => {
    if (open) loadConvo(open).then(loadThreads);
  }, [open, loadConvo, loadThreads]);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and an
  // effect must not return anything but a cleanup function (React crashes)
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [convo?.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open || !draft.trim()) return;
    setSending(true);
    setError("");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: open, body: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return setError(data.error || "Couldn't send");
    setDraft("");
    loadConvo(open);
    loadThreads();
  };

  const startNew = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = newNumber.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (digits.length < 10) return setError("Enter a 10-digit phone number");
    setError("");
    setNewNumber("");
    setOpen(digits);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Messages</h1>
        <p className="text-sm text-stone-500 mt-0.5">Texts to the shop phone. Replies go out from the same number.</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden md:grid md:grid-cols-[280px_1fr] h-[70vh]">
        {/* Conversation list (hidden on phones while a conversation is open) */}
        <aside className={`border-r border-stone-100 overflow-y-auto ${open ? "hidden md:block" : ""}`}>
          <form onSubmit={startNew} className="p-3 border-b border-stone-100 flex gap-2">
            <input
              type="tel"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="Text a number…"
              className="flex-1 min-w-0 text-sm px-3 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <button className="text-sm font-semibold px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700">Go</button>
          </form>
          {threads.length === 0 ? (
            <p className="p-6 text-sm text-stone-400 text-center">No texts yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.phone}
                onClick={() => setOpen(t.phone)}
                className={`w-full text-left px-4 py-3 border-b border-stone-50 hover:bg-stone-50 ${open === t.phone ? "bg-amber-50/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${t.unread ? "font-bold text-stone-900" : "font-medium text-stone-800"}`}>
                    {t.name ?? pretty(t.phone)}
                  </span>
                  <span className="text-[11px] text-stone-400 shrink-0">{when(t.last.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-500 truncate">
                    {t.last.direction === "OUT" && "You: "}
                    {t.last.body}
                  </span>
                  {t.unread > 0 && (
                    <span className="text-[10px] font-bold text-white bg-amber-600 rounded-full px-1.5 py-0.5 shrink-0">{t.unread}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Conversation */}
        <section className={`flex flex-col h-full min-h-0 ${open ? "" : "hidden md:flex"}`}>
          {!open ? (
            <div className="flex-1 flex items-center justify-center text-sm text-stone-400">Pick a conversation</div>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
                <button onClick={() => setOpen(null)} className="md:hidden text-sm text-stone-500">
                  ← Back
                </button>
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{convo?.name ?? pretty(open)}</div>
                  {convo?.name && <div className="text-xs text-stone-500">{pretty(open)}</div>}
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#FAFAF8]">
                {convo?.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line ${
                        m.direction === "OUT" ? "bg-amber-600 text-white rounded-br-sm" : "bg-white border border-stone-200 text-stone-800 rounded-bl-sm"
                      }`}
                    >
                      {m.body}
                      <div className={`text-[10px] mt-1 ${m.direction === "OUT" ? "text-amber-100" : "text-stone-400"}`}>
                        {when(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {convo?.optedOut ? (
                <p className="p-3 text-xs text-center text-stone-500 border-t border-stone-100">
                  They replied STOP, so they can&apos;t be texted unless they reply START.
                </p>
              ) : (
                <form onSubmit={send} className="p-3 border-t border-stone-100 flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) send(e);
                    }}
                    placeholder="Type a reply…"
                    className="flex-1 text-sm px-3 py-2 border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <button
                    disabled={sending || !draft.trim()}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-xl"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </form>
              )}
              {error && <p className="px-3 pb-3 text-xs text-red-600">{error}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
