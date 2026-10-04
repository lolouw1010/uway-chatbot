import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "../../app/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatWorkspace } from "@/components/chat-workspace";
import { EmbeddedChat } from "@/components/embedded-chat";
import { HomeExperience } from "@/components/home-experience";

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/chat") return <ChatWorkspace />;
  if (path === "/embed") {
    const query = new URLSearchParams(window.location.search).get("q")?.trim().slice(0, 800) || "";
    return <EmbeddedChat initialQuery={query} />;
  }
  return <HomeExperience />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
