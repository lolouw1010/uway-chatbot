"use client";

import { Globe2, Sparkles } from "lucide-react";
import { BrandMark } from "./brand-mark";

export function SiteHeader({ onAsk }: { onAsk: () => void }) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="UWAY AI home">
        <BrandMark />
        <span>UWAY Innovation</span>
      </a>
      <button className="header-ai-button" onClick={onAsk}>
        <Sparkles size={15} />
        <span>Ask UWAY AI</span>
        <i aria-hidden="true" />
      </button>
      <nav className="site-nav" aria-label="Primary navigation">
        <a href="https://hkuway.com/solutions/">Solutions</a>
        <a href="https://hkuway.com/insights/">Insights</a>
        <a href="https://hkuway.com/docs/">Docs</a>
        <a href="https://hkuway.com/#partners">Partnership</a>
      </nav>
      <div className="header-actions">
        <a className="language-link" href="https://hkuway.com/zh-hant/docs/" aria-label="Traditional Chinese">
          <Globe2 size={15} />
          <span>繁體</span>
        </a>
        <a className="consultation-link" href="mailto:contacts@hkuway.com">Book consultation</a>
      </div>
    </header>
  );
}
