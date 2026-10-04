(function mountUwayAssistant() {
  "use strict";

  if (document.getElementById("uway-ai-widget-root")) return;

  const script = document.currentScript;
  const chatOrigin = script?.dataset.chatOrigin || (script?.src ? new URL(script.src).origin : "https://chatbot.hkuway.com");
  const isChinese = document.documentElement.lang.toLowerCase().startsWith("zh");
  const copy = isChinese
    ? {
        ask: "詢問 UWAY AI",
        search: "搜尋 UWAY 文件",
        placeholder: "詢問 UWAY AI…",
        open: "開啟 UWAY AI 助手",
        close: "關閉 UWAY AI 助手",
        connected: "文件已連接",
        full: "在完整頁面開啟",
      }
    : {
        ask: "Ask UWAY AI",
        search: "Search UWAY Docs",
        placeholder: "Ask UWAY AI…",
        open: "Open UWAY AI Assistant",
        close: "Close UWAY AI Assistant",
        connected: "Docs connected",
        full: "Open full assistant",
      };

  const style = document.createElement("style");
  style.id = "uway-ai-widget-styles";
  style.textContent = `
    .uway-ai-nav-form,
    .uway-ai-launcher,
    .uway-ai-panel,
    .uway-ai-backdrop { box-sizing: border-box; font-family: "Manrope", "Avenir Next", system-ui, sans-serif; }

    .uway-ai-nav-form {
      flex: 1 1 260px;
      width: min(100%, 330px);
      max-width: 330px;
      height: 42px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) 40px;
      align-items: center;
      color: #111312;
      background: rgba(251, 248, 239, .72);
      border: 1px solid rgba(17, 19, 18, .2);
      transition: border-color 180ms ease, background 180ms ease;
    }
    .uway-ai-nav-form:focus-within { border-color: #2b765d; background: #fbf8ef; }
    .uway-ai-nav-form label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 12px;
      color: #2b765d;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .05em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .uway-ai-nav-form label::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #56b889;
      box-shadow: 0 0 0 4px rgba(86, 184, 137, .12);
    }
    .uway-ai-nav-form input {
      width: 100%;
      min-width: 0;
      height: 40px;
      padding: 0 10px;
      color: #111312;
      background: transparent;
      border: 0;
      outline: 0;
      font: inherit;
      font-size: 12px;
    }
    .uway-ai-nav-form input::placeholder { color: #777d79; opacity: 1; }
    .uway-ai-nav-form button {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      padding: 0;
      color: #fff;
      background: #111312;
      border: 0;
      cursor: pointer;
      transition: background 180ms ease;
    }
    .uway-ai-nav-form button:hover { background: #2b765d; }
    .uway-ai-nav-form button:focus-visible,
    .uway-ai-launcher:focus-visible,
    .uway-ai-panel-action:focus-visible { outline: 2px solid #bc8b43; outline-offset: 3px; }

    .uway-ai-launcher {
      position: fixed;
      z-index: 72;
      right: 24px;
      bottom: 24px;
      min-height: 58px;
      display: flex;
      align-items: stretch;
      padding: 0;
      color: #111312;
      background: transparent;
      border: 0;
      cursor: pointer;
      filter: drop-shadow(0 14px 28px rgba(13, 23, 19, .18));
      transition: opacity 160ms ease, transform 200ms ease;
    }
    .uway-ai-launcher:hover { transform: translateY(-3px); }
    .uway-ai-launcher[aria-expanded="true"] { opacity: 0; pointer-events: none; transform: translateY(12px); }
    .uway-ai-launcher-copy {
      min-width: 144px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 0 16px;
      background: #fbf8ef;
      border: 1px solid rgba(17, 19, 18, .28);
      border-right: 0;
    }
    .uway-ai-launcher-copy strong { font-size: 12px; }
    .uway-ai-launcher-copy small { margin-top: 2px; color: #737a76; font-size: 9px; }
    .uway-ai-launcher-icon {
      width: 58px;
      min-width: 58px;
      display: grid;
      place-items: center;
      position: relative;
      color: #fff;
      background: #111816;
    }
    .uway-ai-launcher-icon::after {
      content: "";
      position: absolute;
      top: 8px;
      right: 8px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #61bd91;
      box-shadow: 0 0 0 4px rgba(97, 189, 145, .13);
    }

    .uway-ai-backdrop {
      position: fixed;
      z-index: 70;
      inset: 0;
      padding: 0;
      background: rgba(9, 16, 13, .2);
      border: 0;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      cursor: default;
      transition: opacity 220ms ease, visibility 220ms ease;
    }
    .uway-ai-backdrop.is-open { opacity: 1; visibility: visible; pointer-events: auto; }

    .uway-ai-panel {
      position: fixed;
      z-index: 71;
      right: 24px;
      bottom: 24px;
      width: min(430px, calc(100vw - 48px));
      height: min(720px, calc(100dvh - 48px));
      display: grid;
      grid-template-rows: 66px minmax(0, 1fr);
      color: #111312;
      background: #fbf8ef;
      border: 1px solid rgba(17, 19, 18, .38);
      box-shadow: 0 28px 80px rgba(9, 19, 14, .28);
      opacity: 0;
      visibility: hidden;
      transform: translateY(18px) scale(.985);
      transform-origin: bottom right;
      transition: opacity 180ms ease, transform 240ms cubic-bezier(.2, .7, .2, 1), visibility 180ms ease;
    }
    .uway-ai-panel.is-open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
    .uway-ai-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px 0 16px;
      color: #f5f4ef;
      background: #17211d;
      border-bottom: 1px solid rgba(255, 255, 255, .12);
    }
    .uway-ai-panel-brand { display: flex; align-items: center; gap: 11px; }
    .uway-ai-panel-brand img { width: 28px; height: 28px; object-fit: contain; filter: brightness(0) invert(1); }
    .uway-ai-panel-brand > span { display: flex; flex-direction: column; }
    .uway-ai-panel-brand strong { font-size: 13px; }
    .uway-ai-panel-brand small { margin-top: 2px; color: #9da6a1; font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
    .uway-ai-panel-brand small::before { content: ""; display: inline-block; width: 5px; height: 5px; margin: 0 6px 1px 0; border-radius: 50%; background: #61bd91; }
    .uway-ai-panel-actions { display: flex; align-items: center; gap: 3px; }
    .uway-ai-panel-action {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      padding: 0;
      color: #c8ceca;
      background: transparent;
      border: 0;
      cursor: pointer;
      transition: color 160ms ease, background 160ms ease;
    }
    .uway-ai-panel-action:hover { color: #fff; background: rgba(255, 255, 255, .08); }
    .uway-ai-panel iframe { width: 100%; height: 100%; min-height: 0; display: block; background: #fbf8ef; border: 0; }

    @media (max-width: 1319px) {
      .uway-ai-nav-form { display: none; }
    }
    @media (max-width: 640px) {
      html.uway-ai-widget-open body { overflow: hidden; }
      .uway-ai-launcher { right: 16px; bottom: 16px; min-height: 56px; }
      .uway-ai-launcher-copy { display: none; }
      .uway-ai-launcher-icon { width: 56px; min-width: 56px; }
      .uway-ai-panel { inset: auto 0 0; width: 100%; height: calc(100dvh - 12px); border-right: 0; border-bottom: 0; border-left: 0; transform: translateY(30px); transform-origin: bottom; }
      .uway-ai-panel.is-open { transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .uway-ai-nav-form,
      .uway-ai-launcher,
      .uway-ai-backdrop,
      .uway-ai-panel { transition-duration: .01ms !important; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "uway-ai-widget-root";

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "uway-ai-launcher";
  launcher.setAttribute("aria-label", copy.open);
  launcher.setAttribute("aria-controls", "uway-ai-panel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = `
    <span class="uway-ai-launcher-copy"><strong>${copy.ask}</strong><small>${copy.search}</small></span>
    <span class="uway-ai-launcher-icon" aria-hidden="true">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.6-4.8A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>
        <path d="M8 10h.01M12 10h.01M16 10h.01"/>
      </svg>
    </span>`;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "uway-ai-backdrop";
  backdrop.setAttribute("aria-label", copy.close);
  backdrop.tabIndex = -1;

  const panel = document.createElement("aside");
  panel.id = "uway-ai-panel";
  panel.className = "uway-ai-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", copy.ask);
  panel.setAttribute("aria-hidden", "true");

  const panelHeader = document.createElement("header");
  panelHeader.className = "uway-ai-panel-header";
  panelHeader.innerHTML = `
    <div class="uway-ai-panel-brand">
      <img src="/assets/UWAY_icon_small.png" alt="" aria-hidden="true" />
      <span><strong>${copy.ask}</strong><small>${copy.connected}</small></span>
    </div>
    <div class="uway-ai-panel-actions">
      <a class="uway-ai-panel-action" href="${chatOrigin}/chat" target="_blank" rel="noreferrer" aria-label="${copy.full}">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
      </a>
      <button class="uway-ai-panel-action" type="button" data-uway-ai-close aria-label="${copy.close}">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>`;

  const frame = document.createElement("iframe");
  frame.title = copy.ask;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.setAttribute("allow", "clipboard-write");
  frame.dataset.loaded = "false";

  panel.append(panelHeader, frame);
  root.append(backdrop, launcher, panel);
  document.body.appendChild(root);

  let restoreFocus = null;

  function buildFrameUrl(query) {
    const url = new URL("/embed/", chatOrigin);
    if (query) url.searchParams.set("q", query.slice(0, 800));
    return url.toString();
  }

  function openPanel(query) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : launcher;
    if (query || frame.dataset.loaded !== "true") {
      frame.src = buildFrameUrl(query);
      frame.dataset.loaded = "true";
    }
    launcher.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.documentElement.classList.add("uway-ai-widget-open");
    window.setTimeout(() => panel.querySelector("[data-uway-ai-close]")?.focus(), 180);
  }

  function closePanel() {
    launcher.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.documentElement.classList.remove("uway-ai-widget-open");
    if (restoreFocus instanceof HTMLElement) restoreFocus.focus();
  }

  launcher.addEventListener("click", () => openPanel(""));
  backdrop.addEventListener("click", closePanel);
  panel.querySelector("[data-uway-ai-close]")?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) closePanel();
  });

  const navInner = document.querySelector(".nav-inner");
  const navLinks = navInner?.querySelector(".nav-links");
  if (navInner && navLinks) {
    const navForm = document.createElement("form");
    navForm.className = "uway-ai-nav-form";
    navForm.setAttribute("role", "search");
    navForm.innerHTML = `
      <label for="uway-ai-nav-query">AI</label>
      <input id="uway-ai-nav-query" name="q" type="search" maxlength="800" autocomplete="off" placeholder="${copy.placeholder}" aria-label="${copy.placeholder}" />
      <button type="submit" aria-label="${copy.ask}" aria-controls="uway-ai-panel">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 14 0M13 6l6 6-6 6"/></svg>
      </button>`;
    navInner.insertBefore(navForm, navLinks);
    navForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = navForm.querySelector("input");
      const query = input instanceof HTMLInputElement ? input.value.trim() : "";
      openPanel(query);
    });
  }
})();
