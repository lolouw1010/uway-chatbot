"use client";

import { ArrowUp, BookOpen, ExternalLink, MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Source } from "@/lib/types";
import { BrandMark } from "./brand-mark";

const starters = [
  "How does Compliance Quality Analysis identify control gaps?",
  "What inputs and approval steps does AI Travel Rule Auto Configer use?",
  "How does AI AML Sentinel reduce false-positive alerts?",
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FloatingChat({
  open,
  onOpen,
  onClose,
  embedded = false,
  initialQuery = "",
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  embedded?: boolean;
  initialQuery?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const askedInitial = useRef(false);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 260);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !embedded) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [embedded, onClose, open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [loading, messages, open]);

  const ask = useCallback(async (question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || loading) return;
    const userMessage: ChatMessage = { id: makeId(), role: "user", content: cleanQuestion };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json() as {
        error?: string;
        text: string;
        sources?: Source[];
        provider?: string;
        model?: string;
      };
      if (!response.ok) throw new Error(data.error || "The assistant could not respond.");
      setMessages((current) => [...current, {
        id: makeId(),
        role: "assistant",
        content: data.text,
        sources: data.sources,
        provider: data.provider,
        model: data.model,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: makeId(),
        role: "assistant",
        content: error instanceof Error ? error.message : "The assistant could not respond.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  useEffect(() => {
    const cleanQuery = initialQuery.trim();
    if (!open || !cleanQuery || askedInitial.current) return;
    askedInitial.current = true;
    void ask(cleanQuery);
  }, [ask, initialQuery, open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function reset() {
    setMessages([]);
    setInput("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <>
      {!embedded ? (
        <button className={`floating-chat-launcher${open ? " floating-chat-launcher--hidden" : ""}`} onClick={onOpen} aria-label="Open UWAY AI Assistant">
          <span className="launcher-label"><strong>Ask UWAY AI</strong><small>Search UWAY Docs</small></span>
          <span className="launcher-icon"><MessageCircle size={23} /><i aria-hidden="true" /></span>
        </button>
      ) : null}

      {!embedded ? (
        <button className={`chat-backdrop${open ? " chat-backdrop--visible" : ""}`} onClick={onClose} aria-label="Close UWAY AI Assistant" tabIndex={open ? 0 : -1} />
      ) : null}

      <section
        className={`floating-chat-panel${open ? " floating-chat-panel--open" : ""}${embedded ? " floating-chat-panel--embedded" : ""}`}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="UWAY AI Assistant"
        aria-hidden={embedded ? undefined : !open}
      >
        {!embedded ? (
          <header className="widget-header">
            <div className="widget-brand"><BrandMark /><div><strong>Ask UWAY AI</strong><span><i />Docs connected</span></div></div>
            <div className="widget-actions">
              {messages.length ? <button onClick={reset} aria-label="Start a new question"><RotateCcw size={16} /></button> : null}
              <button onClick={onClose} aria-label="Close assistant"><X size={19} /></button>
            </div>
          </header>
        ) : null}

        <div className="widget-body">
          {messages.length === 0 ? (
            <div className="widget-welcome">
              <span className="widget-spark"><Sparkles size={17} /></span>
              <p className="widget-eyebrow">Evidence-linked knowledge</p>
              <h2>How can we help?</h2>
              <p>Ask about UWAY products, compliance controls, Travel Rule configuration or AML alert review.</p>
              <div className="widget-starters">
                {starters.map((starter) => <button key={starter} onClick={() => void ask(starter)}>{starter}<ArrowUp size={14} /></button>)}
              </div>
            </div>
          ) : (
            <div className="widget-messages">
              {messages.map((message) => (
                <article key={message.id} className={`widget-message widget-message--${message.role}`}>
                  <span>{message.role === "user" ? "You" : "UWAY AI"}</span>
                  <div className="widget-message-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                  {message.sources?.length ? (
                    <div className="widget-sources">
                      <strong><BookOpen size={13} />Sources</strong>
                      {message.sources.slice(0, 3).map((source, index) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>0{index + 1}</span>{source.title}<ExternalLink size={12} /></a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {loading ? <div className="widget-thinking"><span /><span /><span /><p>Reviewing UWAY Docs…</p></div> : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <footer className="widget-composer-wrap">
          <form className="widget-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="widget-question">Ask UWAY AI</label>
            <textarea
              ref={inputRef}
              id="widget-question"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void ask(input);
                }
              }}
              placeholder="Ask UWAY Docs…"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="Send question"><ArrowUp size={17} /></button>
          </form>
          <p>Do not enter personal or confidential customer data.</p>
        </footer>
      </section>
    </>
  );
}
