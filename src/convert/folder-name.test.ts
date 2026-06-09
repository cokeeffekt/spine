import { describe, test, expect } from "bun:test";
import { parseFolderName, cleanSearchTitle } from "./folder-name.js";

describe("parseFolderName", () => {
  test("splits on bare hyphen and collapses double spaces", () => {
    expect(parseFolderName("Charles  Stross-Accelerando")).toEqual({
      author: "Charles Stross",
      title: "Accelerando",
    });
  });

  test("prefers spaced separator over bare hyphen in the title", () => {
    expect(parseFolderName("Stephen King - Salem's Lot - Special")).toEqual({
      author: "Stephen King",
      title: "Salem's Lot - Special",
    });
  });

  test("keeps hyphenated titles intact when a spaced separator exists", () => {
    expect(parseFolderName("Author Name - The Self-Made Man")).toEqual({
      author: "Author Name",
      title: "The Self-Made Man",
    });
  });

  test("no separator yields null author and whole string as title", () => {
    expect(parseFolderName("Accelerando")).toEqual({
      author: null,
      title: "Accelerando",
    });
  });

  test("trims surrounding whitespace", () => {
    expect(parseFolderName("  Jane Doe - A Title  ")).toEqual({
      author: "Jane Doe",
      title: "A Title",
    });
  });

  test("empty string yields empty title", () => {
    expect(parseFolderName("   ")).toEqual({ author: null, title: "" });
  });

  test("strips a leading year prefix (year is not an author)", () => {
    expect(parseFolderName("1983 - Christine (read by Holter Graham)")).toEqual({
      author: null,
      title: "Christine (read by Holter Graham)",
    });
    expect(parseFolderName("1981 - Roadwork")).toEqual({ author: null, title: "Roadwork" });
    expect(parseFolderName("1982-The Talisman")).toEqual({ author: null, title: "The Talisman" });
  });

  test("year prefix strip still recovers an author after the year", () => {
    expect(parseFolderName("1983 - Stephen King - Christine")).toEqual({
      author: "Stephen King",
      title: "Christine",
    });
  });

  test("a 4-digit-only folder with no separator is left as the title", () => {
    expect(parseFolderName("2001")).toEqual({ author: null, title: "2001" });
  });

  test("does not split on a ' - ' inside parentheses", () => {
    expect(parseFolderName("1982 - The Gunslinger (DT1 - revised edition - read by George Guidall)")).toEqual({
      author: null,
      title: "The Gunslinger (DT1 - revised edition - read by George Guidall)",
    });
  });

  test("still splits a real author separator outside parentheses", () => {
    expect(parseFolderName("Ruby Dixon - Barbarian Alien (Unabridged)")).toEqual({
      author: "Ruby Dixon",
      title: "Barbarian Alien (Unabridged)",
    });
  });
});

describe("cleanSearchTitle", () => {
  test("strips parenthetical reader/edition notes", () => {
    expect(cleanSearchTitle("The Gunslinger (DT1 - revised edition - read by George Guidall)")).toBe("The Gunslinger");
    expect(cleanSearchTitle("'Salem's Lot (read by Richard Nazarewich)")).toBe("'Salem's Lot");
    expect(cleanSearchTitle("The Stand (Complete & Uncut - read by Garrick Hagon)")).toBe("The Stand");
  });
  test("strips a trailing 'read by' clause without parens", () => {
    expect(cleanSearchTitle("On Writing read by Stephen King")).toBe("On Writing");
  });
  test("leaves a clean title unchanged", () => {
    expect(cleanSearchTitle("Galactic Pot-Healer")).toBe("Galactic Pot-Healer");
  });
  test("falls back to the trimmed input if cleaning empties it", () => {
    expect(cleanSearchTitle("(read by Someone)")).toBe("(read by Someone)");
  });
});
