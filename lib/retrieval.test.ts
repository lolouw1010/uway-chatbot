import { describe, expect, it } from "vitest";
import { retrieve, toSources } from "./retrieval";

describe("documentation retrieval", () => {
  it("returns a bounded list for a compliance query", () => {
    const results = retrieve("AML alert triage evidence", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("deduplicates source URLs", () => {
    const results = retrieve("UWAY documentation", 5);
    const sources = toSources([...results, ...results]);
    expect(new Set(sources.map((source) => source.url)).size).toBe(sources.length);
  });

  it("maps common Chinese compliance terms to English documentation", () => {
    const [result] = retrieve("如何进行反洗钱警报审查？", 1);
    expect(`${result.title} ${result.text}`.toLowerCase()).toMatch(/aml|alert/);
  });

  it.each([
    ["How does Compliance Quality Analysis identify control gaps?", "compliance-quality"],
    ["What inputs and approval steps does AI Travel Rule Auto Configer use?", "travel-rule"],
    ["How does AI AML Sentinel reduce false-positive alerts?", "aml-sentinel"],
    ["合规质量分析如何发现控制缺口？", "compliance-quality"],
    ["AI 旅行规则自动配置器如何配置走廊策略？", "travel-rule"],
    ["AI AML 哨兵如何减少告警误报？", "aml-sentinel"],
  ])("routes %s to the intended product domain", (query, domain) => {
    expect(retrieve(query, 1)[0]?.domain).toBe(domain);
  });

  it("prioritizes official regulatory material when a regulator is named", () => {
    const results = retrieve("What does HKMA guidance say about AML controls?", 3);
    expect(results.some((result) => result.domain === "regulatory" && result.url.includes("hkma.gov.hk"))).toBe(true);
  });

  it.each([
    ["KYB的数据范围有哪些？", /business-verification|full-kyb/],
    ["KYC应该怎么集成？", /user-verification|conduct-id-verification|overview|web-sdk|sumsub-api/],
    ["Sumsub KYC 有哪些集成方式？WebSDK、MobileSDK 和 API 应该怎么选？", /web-sdk|mobile-sdk|sumsub-api|get-started-with-api/],
  ])("routes vendor verification questions to relevant Sumsub documentation: %s", (query, expectedUrl) => {
    const results = retrieve(query, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.domain).toBe("sumsub");
    expect(results.some((result) => expectedUrl.test(result.url))).toBe(true);
  });

  it("does not return unrelated documentation when nothing matches", () => {
    expect(retrieve("火星天气怎么样？", 5)).toEqual([]);
  });
});
