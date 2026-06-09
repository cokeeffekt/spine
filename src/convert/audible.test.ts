import { describe, test, expect } from "bun:test";
import { pickBestProduct, authorMatches, titleSimilarity } from "./audible.js";

const products = [
  { asin: "BOOK1", title: "Ice Planet Barbarians", runtime_length_min: 480 },   // relevance #1 (book 1)
  { asin: "BOOK10", title: "Barbarian's Hope", runtime_length_min: 326 },        // the real match
  { asin: "OMNIBUS", title: "Ice Planet Barbarians Box Set", runtime_length_min: 2400 },
];

describe("pickBestProduct", () => {
  test("with duration: picks the runtime-closest, not the first", () => {
    // file is ~325 min → should pick BOOK10, not the relevance-first BOOK1
    const p = pickBestProduct(products, 325 * 60);
    expect(p?.asin).toBe("BOOK10");
  });

  test("without duration: falls back to first (relevance)", () => {
    const p = pickBestProduct(products);
    expect(p?.asin).toBe("BOOK1");
  });

  test("ignores candidates without asin", () => {
    const p = pickBestProduct([{ title: "no asin", runtime_length_min: 325 }, products[0]], 325 * 60);
    expect(p?.asin).toBe("BOOK1");
  });

  test("returns null when no products", () => {
    expect(pickBestProduct([], 1000)).toBeNull();
  });

  test("falls back to first when no candidate has a runtime", () => {
    const noRuntime = [{ asin: "A" }, { asin: "B" }];
    expect(pickBestProduct(noRuntime, 1000)?.asin).toBe("A");
  });

  test("rejects a same-title parody by a different author (Electric Sheep case)", () => {
    // Source: "Do Androids Dream of Electric Sheep" by Philip K Dick, ~177 min (abridged).
    // The real book only appears under other titles; Tingle's 23-min parody is runtime-closest.
    const results = [
      { asin: "BLADE", title: "Blade Runner", authors: [{ name: "Philip K. Dick" }], runtime_length_min: 552 },
      { asin: "TINGLE", title: "Do Androids Dream of Electric Butts?", authors: [{ name: "Chuck Tingle" }], runtime_length_min: 23 },
    ];
    // No confident match → null (caller keeps the correct source metadata).
    expect(pickBestProduct(results, 177 * 60, { title: "Do Androids Dream of Electric Sheep", author: "Philip K Dick" })).toBeNull();
  });

  test("with hints: picks the right same-author edition by runtime", () => {
    const results = [
      { asin: "FULL", title: "Barbarian's Hope", authors: [{ name: "Ruby Dixon" }], runtime_length_min: 600 },
      { asin: "ABR", title: "Barbarian's Hope", authors: [{ name: "Ruby Dixon" }], runtime_length_min: 326 },
    ];
    expect(pickBestProduct(results, 325 * 60, { title: "Barbarians Hope", author: "Ruby Dixon" })?.asin).toBe("ABR");
  });
});

describe("authorMatches", () => {
  test("matches despite punctuation/spacing differences", () => {
    expect(authorMatches("Philip K Dick", [{ name: "Philip K. Dick" }])).toBe(true);
    expect(authorMatches("ruby dixon", [{ name: "Ruby Dixon" }])).toBe(true);
  });
  test("rejects a different author", () => {
    expect(authorMatches("Philip K Dick", [{ name: "Chuck Tingle" }])).toBe(false);
    expect(authorMatches("Stephen King", [{ name: "Richard Bachman" }])).toBe(false);
  });
  test("no product authors → no match", () => {
    expect(authorMatches("Philip K Dick", [])).toBe(false);
    expect(authorMatches("Philip K Dick", undefined)).toBe(false);
  });
});

describe("titleSimilarity", () => {
  test("identical/possessive titles score high", () => {
    expect(titleSimilarity("Galactic Pot-Healer", "Galactic Pot-Healer")).toBe(1);
    expect(titleSimilarity("Barbarians Hope", "Barbarian's Hope")).toBeGreaterThanOrEqual(0.5);
  });
  test("unrelated titles score low", () => {
    expect(titleSimilarity("Do Androids Dream of Electric Sheep", "Blade Runner")).toBe(0);
  });
});
