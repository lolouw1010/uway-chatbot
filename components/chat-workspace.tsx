"use client";

import { ArrowLeft, ArrowUp, BookOpen, ExternalLink, Menu, Plus, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Source } from "@/lib/types";
import { BrandMark } from "./brand-mark";

const suggestions = [
  "How does Compliance Quality Analysis identify control gaps?",
  "What inputs and approval steps does AI Travel Rule Auto Configer use?",
  "How does AI AML Sentinel reduce false-positive alerts?",
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatWorkspace() {
  const [initialQuery, setInitialQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const askedInitial = useRef(false);
  const conversationEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInitialQuery(new URLSearchParams(window.location.search).get("q")?.trim() || "");
  }, []);

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
    if (initialQuery && !askedInitial.current) {
      askedInitial.current = true;
      void ask(initialQuery);
    }
  }, [ask, initialQuery]);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  function reset() {
    setMessages([]);
    setInput("");
    askedInitial.current = true;
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="chat-brand-wrap">
          <button className="mobile-menu" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle navigation"><Menu /></button>
          <a className="chat-brand" href="/"><BrandMark /><strong>UWAY</strong><span>AI Assistant</span></a>
        </div>
        <div className="chat-status"><span /><strong>Docs connected</strong><em>Evidence-linked knowledge</em></div>
        <a className="back-to-site" href="https://hkuway.com/"><span>hkuway.com</span><ExternalLink size={15} /></a>
      </header>

      <div className="chat-layout">
        <aside className={`chat-sidebar${sidebarOpen ? " chat-sidebar--open" : ""}`}>
          <button className="new-chat" onClick={reset}><Plus size={17} />New question</button>
          <div className="sidebar-group">
            <small>Knowledge scope</small>
            <a href="https://hkuway.com/docs/"><BookOpen size={16} /><span>UWAY Documentation</span></a>
            <div className="scope-list">
              <span>Compliance Quality Analysis</span>
              <span>AI Travel Rule Auto Configer</span>
              <span>AI AML Sentinel</span>
              <span>API & deployment</span>
              <span>APAC controls</span>
            </div>
          </div>
          <div className="sidebar-foot">
            <p>Answers use retrieved passages from UWAY Docs. Verify material decisions against the cited source.</p>
            <a href="/"><ArrowLeft size={15} />Back to search</a>
          </div>
        </aside>

        <main className="conversation">
          {messages.length === 0 && !loading ? (
            <section className="chat-empty">
              <div className="empty-mark"><Sparkles size={20} /></div>
              <p className="eyebrow">UWAY documentation assistant</p>
              <h1>What do you need to decide?</h1>
              <p>Ask about a product, operating workflow, API contract, deployment choice or APAC compliance control.</p>
              <div className="chat-suggestions">
                {suggestions.map((suggestion, index) => (
                  <button key={suggestion} onClick={() => void ask(suggestion)}>
                    <span>0{index + 1}</span><strong>{suggestion}</strong><ArrowUp size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message message--${message.role}`}>
                  <div className="message-label">{message.role === "user" ? "Your question" : "UWAY AI"}</div>
                  <div className="message-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                  {message.role === "assistant" && message.sources?.length ? (
                    <SourceList sources={message.sources} />
                  ) : null}
                  {message.role === "assistant" && message.model ? (
                    <div className="answer-meta"><span />Answered via {message.provider} · {message.model}</div>
                  ) : null}
                </article>
              ))}
              {loading ? (
                <article className="message message--assistant message--loading">
                  <div className="message-label">UWAY AI</div>
                  <div className="loading-line"><span /><span /><span /></div>
                  <p>Reviewing the most relevant documentation…</p>
                </article>
              ) : null}
              <div ref={conversationEnd} />
            </div>
          )}

          <div className="composer-wrap">
            <form className="chat-composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="chat-question">Ask a follow-up question</label>
              <textarea
                id="chat-question"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (input.trim()) void ask(input);
                  }
                }}
                placeholder={messages.length ? "Ask a follow-up question…" : "Ask UWAY documentation…"}
                rows={1}
              />
              <button type="submit" disabled={!input.trim() || loading} aria-label="Send question"><ArrowUp size={19} /></button>
            </form>
            <p>UWAY AI can make mistakes. Check cited documentation before making compliance decisions.</p>
          </div>
        </main>
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="source-block">
      <div className="source-title"><BookOpen size={15} /><strong>Sources</strong><span>{sources.length} documents</span></div>
      <div className="source-list">
        {sources.map((source, index) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{source.title}</strong><p>{source.excerpt}</p></div>
            <ExternalLink size={15} />
          </a>
        ))}
      </div>
    </div>
  );
}
