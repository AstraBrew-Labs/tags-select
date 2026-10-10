import { describe, expect, test } from "bun:test";
import { resolveTagImageQuery } from "./tag-image-query";

describe("Danbooru example tag queries", () => {
  test("supports general tags and strips only the recognized artist prefix", () => {
    expect(resolveTagImageQuery(" Long Hair ")).toBe("long_hair");
    expect(resolveTagImageQuery("forest")).toBe("forest");
    expect(resolveTagImageQuery("artist: Anmi")).toBe("anmi");
    expect(resolveTagImageQuery("ARTIST:Foo_(Bar)")).toBe("foo_(bar)");
  });
  test("uses the structured prompt parser for emphasis and composite entries", () => {
    for (const value of [
      "{long hair}", "(long hair:1.2)", "1.2::long hair::",
      "{long hair, blue eyes}", "long hair，blue eyes",
      "0.7::long hair, blue eyes::", "long hair, rating:e",
    ]) expect(resolveTagImageQuery(value)).toBe("long_hair");
    expect(resolveTagImageQuery("{artist:anmi}")).toBe("anmi");
  });
  test("preserves character qualifiers and verified aliases", () => {
    expect(resolveTagImageQuery("last order (Toaru Majutsu no Index)"))
      .toBe("last_order_(toaru_majutsu_no_index)");
    expect(resolveTagImageQuery("jouga_maya_(gochuumon_wa_usagi_desu_ka?)"))
      .toBe("jouga_maya");
    expect(resolveTagImageQuery("foo_(bar,baz)")).toBe("");
  });
  test("never sends metatags, operators, oversized or empty values", () => {
    for (const value of [
      "", "{}", "artist:", "rating:e", "rating:e, forest",
      "order:random", "*", "-forest", "~forest", "forest\u0000",
      "a".repeat(201), "a".repeat(10_001),
    ]) expect(resolveTagImageQuery(value)).toBe("");
  });
});
