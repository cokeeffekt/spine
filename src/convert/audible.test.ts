import { describe, test, expect } from "bun:test";
import { pickBestProduct } from "./audible.js";

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
});
