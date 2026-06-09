import { describe, test, expect } from "bun:test";
import { parseFolderName } from "./folder-name.js";

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
});
