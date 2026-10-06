import docs from "../data/docs.json";
import type { DocumentChunk, KnowledgeDomain, Source } from "./types";

const corpus = docs as DocumentChunk[];
const stopwords = new Set([
  "about", "and", "are", "can", "does", "for", "from", "how", "into", "our", "the", "this", "what", "when", "where", "which", "with",
  "一个", "什么", "可以", "如何", "怎么", "我们", "我的", "是否", "这个", "进行",
]);

function terms(value: string) {
  const aliases: Array<[RegExp, string]> = [
    [/\bkyb\b|企业验证|企業驗證|公司验证|公司驗證|商业验证|商業驗證|了解你的企业|了解你的企業/g, " kyb business verification company ownership ubo registry "],
    [/\bkyc\b|客户尽职调查|客戶盡職調查|了解你的客户|了解你的客戶|用户验证|用戶驗證|身份验证|身份驗證|实名认证|實名認證/g, " kyc user identity verification applicant due diligence "],
    [/\bweb\s*sdk\b|网页sdk|網頁sdk|网页端sdk|網頁端sdk/g, " websdk web sdk integration access token "],
    [/\bmobile\s*sdk\b|移动sdk|移動sdk|移动端sdk|移動端sdk/g, " mobilesdk mobile sdk integration android ios "],
    [/(集成|接入|对接|對接)/g, " integration implement "],
    [/(数据范围|數據範圍|资料范围|資料範圍|所需资料|所需資料)/g, " requirements data scope documents ownership "],
    [/(反洗钱|反洗錢|洗钱|洗錢)/g, " aml anti money laundering "],
    [/(旅行规则|旅行規則|旅规|旅規)/g, " travel rule corridor "],
    [/(告警|警报|警報|预警|預警)/g, " alert triage "],
    [/(部署|私有云|私有雲)/g, " deployment cloud vpc "],
    [/(监管|監管|法规|法規)/g, " regulatory control "],
    [/(证据|證據|审计|審計)/g, " evidence audit "],
    [/(制裁|筛查|篩查)/g, " sanctions screening "],
    [/(合规质量|合規質量|质量分析|質量分析|质量审查|質量審查)/g, " compliance quality analysis control gap review "],
    [/(控制缺口|管控缺口|控制差距)/g, " control gap evidence finding "],
    [/(自动配置|自動配置|配置器)/g, " auto configer configuration policy corridor "],
    [/(哨兵|误报|誤報)/g, " sentinel false positive alert triage "],
    [/(金管局|香港金融管理局)/g, " hkma regulatory "],
    [/(证监会|證監會|证券及期货事务监察委员会|證券及期貨事務監察委員會)/g, " sfc regulatory "],
  ];
  const expanded = aliases.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value.toLowerCase());

  return expanded
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1 && !stopwords.has(term));
}

function intendedDomains(query: string): Map<KnowledgeDomain, number> {
  const value = query.toLowerCase();
  const boosts = new Map<KnowledgeDomain, number>();
  const add = (domain: KnowledgeDomain, score: number) => boosts.set(domain, (boosts.get(domain) || 0) + score);

  if (/(compliance[ -]?quality|quality (analysis|review)|control gap|kyc.{0,12}(quality|review)|合规质量|合規質量|质量分析|質量分析|控制缺口)/i.test(value)) {
    add("compliance-quality", 18);
  }
  if (/(travel[ -]?rule|auto[ -]?config|configer|corridor|旅行规则|旅行規則|自动配置|自動配置)/i.test(value)) {
    add("travel-rule", 15);
  }
  if (/(aml[ -]?sentinel|alert triage|false positive|哨兵|误报|誤報|告警审查|告警審查)/i.test(value)) {
    add("aml-sentinel", 18);
  }
  if (/\b(hkma|sfc|fatf|mas)\b|regulat|金管局|证监会|證監會|监管|監管|法规|法規/i.test(value)) {
    add("regulatory", 24);
  }
  if (/\b(sumsub|kyc|kyb|web\s*sdk|mobile\s*sdk)\b|客户尽职调查|客戶盡職調查|用户验证|用戶驗證|身份验证|身份驗證|企业验证|企業驗證|公司验证|公司驗證/i.test(value)) {
    add("sumsub", 24);
  }
  return boosts;
}

export function retrieve(query: string, limit = 5): DocumentChunk[] {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  const domainBoosts = intendedDomains(query);
  const normalizedQuery = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  return corpus
    .map((doc) => {
      const title = doc.title.toLowerCase();
      const url = doc.url.toLowerCase();
      const body = doc.text.toLowerCase();
      const score = queryTerms.reduce((total, term) => {
        const titleScore = title.includes(term) ? 7 : 0;
        const urlScore = url.includes(term) ? 4 : 0;
        const bodyScore = body.includes(term) ? 2 : 0;
        return total + titleScore + urlScore + bodyScore;
      }, domainBoosts.get(doc.domain) || 0);
      const phraseScore = normalizedQuery.length > 8 && `${title} ${body}`.includes(normalizedQuery) ? 12 : 0;
      return { doc, score: score + phraseScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
    .map(({ doc }) => doc);
}

export function toSources(chunks: DocumentChunk[]): Source[] {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    if (seen.has(chunk.url)) return [];
    seen.add(chunk.url);
    return [{
      title: chunk.title,
      url: chunk.url,
      excerpt: chunk.excerpt,
      domain: chunk.domain,
      sourceType: chunk.sourceType,
    }];
  });
}
