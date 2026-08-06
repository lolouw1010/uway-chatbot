"use client";

import { useState } from "react";
import { FloatingChat } from "./floating-chat";
import { SiteHeader } from "./site-header";

export function HomeExperience() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <main className="homepage-shell">
      <SiteHeader onAsk={() => setChatOpen(true)} />
      <section className="original-hero" id="top">
        <div className="original-hero-copy">
          <p className="hero-kicker">APAC compliance infrastructure</p>
          <h1>
            <span>OPERATE</span>
            <span>COMPLIANTLY</span>
            <span>ACROSS THE APAC</span>
            <span>CORRIDOR</span>
          </h1>
          <p className="original-hero-intro">
            UWAY helps <strong>regulated growth teams</strong> manage customer onboarding, transaction monitoring, partner data exchange and audit-ready evidence across APAC.
          </p>
          <div className="hero-actions">
            <a className="hero-action-primary" href="mailto:contacts@hkuway.com">Plan APAC rollout</a>
            <a className="hero-action-secondary" href="https://hkuway.com/solutions/">Explore platform</a>
          </div>
          <div className="hero-metrics" aria-label="UWAY operating highlights">
            <div><strong>APAC</strong><span>regional operating coverage for market expansion</span></div>
            <div><strong>4x</strong><span>faster deployment using modular compliance workflows</span></div>
            <div><strong>60%</strong><span>less false-positive review work in pilot cases</span></div>
          </div>
        </div>

        <div className="apac-visual" aria-label="UWAY APAC visual preview">
          <div className="region-tabs"><span>HK</span><span>SG</span><span>UAE</span><span>KL</span><span>EU</span></div>
          <div className="operating-preview">
            <div className="operating-head"><strong>UWAY APAC Operating Layer</strong><span>live controls</span></div>
            <div className="operating-grid">
              <div><small>Screened today</small><strong>12,847</strong><p>KYC/KYB identities processed with risk evidence attached.</p></div>
              <div><small>Risk queue</small><strong>0.8%</strong><p>Manual review focus after AI-assisted prioritisation.</p></div>
              <div><small>Travel Rule</small><strong>transmitted</strong><p>Originator and beneficiary data exchanged with partner VASP.</p></div>
              <div><small>Audit file</small><strong>ready</strong><p>Case history and decision trail exported.</p></div>
            </div>
          </div>
        </div>
      </section>

      <FloatingChat open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />
    </main>
  );
}
