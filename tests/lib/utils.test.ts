import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("drops falsy values and flattens conditional inputs", () => {
    expect(cn("px-2", false, undefined, null, ["py-1", { "font-bold": true, italic: false }])).toBe(
      "px-2 py-1 font-bold"
    );
  });

  it("lets later tailwind classes win over conflicting earlier ones", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });

  it("returns an empty string with no usable input", () => {
    expect(cn()).toBe("");
    expect(cn(false, undefined)).toBe("");
  });
});
