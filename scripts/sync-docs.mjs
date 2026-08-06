import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "config/knowledge-sources.json");
const target = resolve(process.cwd(), "data/docs.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const previousChunks = JSON.parse(await readFile(target, "utf8").catch(() => "[]"));
const chunks = [];
const preservedChunks = [];
const fetchedUrls = new Set();
const failures = [];

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "document";
}

function inferDomain(url, hint) {
  const value = url.toLowerCase();
  if (value.includes("compliance-quality-analysis") || value.includes("kyc-kyb-quality-review")) return "compliance-quality";
  if (value.includes("travel-rule")) return "travel-rule";
  if (value.includes("aml-sentinel") || value.includes("aml-alert-triage")) return "aml-sentinel";
  return hint || "uway-general";
}

function preservePrevious(source, failedUrl = source.url) {
  const matches = previousChunks.filter((chunk) => {
    if (source.kind === "crawl" && failedUrl === source.url) return chunk.url.startsWith(source.includePrefix);
    return chunk.url === failedUrl;
  });
  preservedChunks.push(...matches);
}

function addTextChunks({ title, sectionTitle, url, text, domain, sourceType }) {
  const normalized = clean(text);
  if (normalized.length < 80) return;
  const maxLength = 3600;
  const overlap = 240;
  let offset = 0;
  let part = 0;

  while (offset < normalized.length) {
    let end = Math.min(offset + maxLength, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(". ", end);
      if (boundary > offset + 1200) end = boundary + 1;
    }
    const chunkText = normalized.slice(offset, end).trim();
    const displayTitle = sectionTitle && sectionTitle !== title ? `${title} — ${sectionTitle}` : title;
    chunks.push({
      id: `${slug(new URL(url).hostname)}-${slug(new URL(url).pathname)}-${slug(sectionTitle || title)}-${part}`,
      title: part ? `${displayTitle} (${part + 1})` : displayTitle,
      url,
      excerpt: `${chunkText.slice(0, 210)}${chunkText.length > 210 ? "…" : ""}`,
      text: chunkText,
      domain: inferDomain(url, domain),
      sourceType,
    });
    if (end >= normalized.length) break;
    offset = Math.max(end - overlap, offset + 1);
    part += 1;
  }
}

function parseHtml(html, source) {
  const $ = cheerio.load(html);
  const content = $("main").first().length ? $("main").first() : $("article").first().length ? $("article").first() : $("body").first();
  content.find("script, style, nav, form, button, svg, noscript, header, footer").remove();
  const pageTitle = clean(content.find("h1").first().text()) || clean($("title").text()) || new URL(source.url).hostname;
  let sectionTitle = pageTitle;
  let sectionText = [];

  function flush() {
    addTextChunks({
      title: pageTitle,
      sectionTitle,
      url: source.url,
      text: sectionText.join(" "),
      domain: source.domain,
      sourceType: "web",
    });
  }

  content.find("h1, h2, h3, p, li, pre, table").each((_, element) => {
    const tag = element.tagName?.toLowerCase();
    const value = clean($(element).text());
    if (!value) return;
    if (tag === "h2" || tag === "h3") {
      flush();
      sectionTitle = value;
      sectionText = [];
    } else {
      sectionText.push(value);
    }
  });
  flush();
}

function parseMarkdown(markdown, source) {
  const lines = markdown.split(/\r?\n/);
  const pageTitle = clean(lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "") || new URL(source.url).pathname.split("/").pop() || "Product documentation");
  let sectionTitle = pageTitle;
  let sectionText = [];

  function flush() {
    addTextChunks({
      title: pageTitle,
      sectionTitle,
      url: source.url,
      text: sectionText.join(" "),
      domain: source.domain,
      sourceType: "repository",
    });
  }

  for (const line of lines) {
    const heading = line.match(/^#{2,3}\s+(.+)/);
    if (heading) {
      flush();
      sectionTitle = clean(heading[1]);
      sectionText = [];
      continue;
    }
    const text = clean(line
      .replace(/```[^`]*$/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`>|]/g, " ")
      .replace(/^[-+]\s+/, ""));
    if (text && !/^#\s+/.test(line)) sectionText.push(text);
  }
  flush();
}

async function fetchText(url) {
  const isGitHubApi = new URL(url).hostname === "api.github.com";
  const response = await fetch(url, {
    headers: {
      "User-Agent": "UWAY-Knowledge-Sync/2.0 (+https://hkuway.com/docs/)",
      ...(isGitHubApi ? { Accept: "application/vnd.github.raw+json" } : {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function processSource(source) {
  if (source.kind === "crawl") {
    const queue = [source.url];
    const queuedUrls = new Set(queue);
    let pageCount = 0;
    while (queue.length && pageCount < (source.maxPages || 30)) {
      const url = queue.shift();
      if (!url || fetchedUrls.has(url)) continue;
      fetchedUrls.add(url);
      try {
        const html = await fetchText(url);
        const links = cheerio.load(html);
        parseHtml(html, { ...source, url });
        pageCount += 1;
        links("a[href]").each((_, element) => {
          try {
            const next = new URL(links(element).attr("href"), url);
            next.hash = "";
            if (next.href.startsWith(source.includePrefix) && !fetchedUrls.has(next.href) && !queuedUrls.has(next.href)) {
              queue.push(next.href);
              queuedUrls.add(next.href);
            }
          } catch {
            // Ignore malformed links from source pages.
          }
        });
      } catch (error) {
        failures.push(`${url}: ${error instanceof Error ? error.message : "unknown error"}`);
        preservePrevious(source, url);
      }
    }
    return;
  }

  if (fetchedUrls.has(source.url)) return;
  fetchedUrls.add(source.url);
  try {
    const content = await fetchText(source.fetchUrl || source.url);
    if (source.kind === "markdown") parseMarkdown(content, source);
    else parseHtml(content, source);
  } catch (error) {
    failures.push(`${source.url}: ${error instanceof Error ? error.message : "unknown error"}`);
    preservePrevious(source);
  }
}

const crawlSources = config.sources.filter((source) => source.kind === "crawl");
const independentSources = config.sources.filter((source) => source.kind !== "crawl");
for (const source of crawlSources) await processSource(source);
await Promise.all(independentSources.map((source) => processSource(source)));

for (const source of crawlSources) {
  preservedChunks.push(...previousChunks.filter((chunk) => (
    chunk.url.startsWith(source.includePrefix) && !fetchedUrls.has(chunk.url)
  )));
}

const deduplicated = Array.from(new Map([...chunks, ...preservedChunks].map((chunk) => [`${chunk.url}|${chunk.title}|${chunk.text.slice(0, 180)}`, chunk])).values());
await writeFile(target, `${JSON.stringify(deduplicated, null, 2)}\n`);

const domains = deduplicated.reduce((counts, chunk) => ({ ...counts, [chunk.domain]: (counts[chunk.domain] || 0) + 1 }), {});
console.log(`Saved ${deduplicated.length} chunks from ${fetchedUrls.size} sources to ${target}`);
console.log(`Domains: ${Object.entries(domains).map(([domain, count]) => `${domain}=${count}`).join(", ")}`);
if (failures.length) {
  console.warn(`Skipped ${failures.length} sources:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  console.warn(`Preserved ${preservedChunks.length} chunks from the previous successful snapshot.`);
}
