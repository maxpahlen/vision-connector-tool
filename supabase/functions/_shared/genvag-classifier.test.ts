/**
 * Unit tests for genvag-classifier.ts
 * 
 * Run with: deno test supabase/functions/_shared/genvag-classifier.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractDocNumber, decodeHtmlEntities, classifyGenvagLink } from "./genvag-classifier.ts";

// ============================================
// extractDocNumber tests
// ============================================

Deno.test("extractDocNumber - SOU patterns", async (t) => {
  await t.step("basic SOU format", () => {
    assertEquals(extractDocNumber("SOU 2024:55"), "SOU 2024:55");
  });

  await t.step("SOU with hyphen separator", () => {
    assertEquals(extractDocNumber("SOU 2024-55"), "SOU 2024:55");
  });

  await t.step("SOU without space", () => {
    assertEquals(extractDocNumber("SOU2024:55"), "SOU 2024:55");
  });

  await t.step("SOU in URL slug format", () => {
    assertEquals(extractDocNumber("sou-2024-55"), "SOU 2024:55");
  });

  await t.step("SOU with title should only extract number", () => {
    assertEquals(
      extractDocNumber("SOU 2024:55 En moderniserad studiestödsmodell"),
      "SOU 2024:55"
    );
  });

  await t.step("SOU in Lagstiftningskedja context", () => {
    assertEquals(
      extractDocNumber("Lagstiftningskedja: SOU 2025:37 Skärpt kontroll av förare i yrkesmässig trafik"),
      "SOU 2025:37"
    );
  });
});

Deno.test("extractDocNumber - Directive patterns", async (t) => {
  await t.step("basic Dir. format", () => {
    assertEquals(extractDocNumber("Dir. 2023:171"), "Dir. 2023:171");
  });

  await t.step("Dir without period", () => {
    assertEquals(extractDocNumber("Dir 2023:171"), "Dir. 2023:171");
  });

  await t.step("Dir with hyphen separator", () => {
    assertEquals(extractDocNumber("Dir. 2023-171"), "Dir. 2023:171");
  });

  await t.step("Dir with full title should only extract number", () => {
    assertEquals(
      extractDocNumber("Dir. 2023:171 Tilläggsdirektiv till Utredningen om en mer ändamålsenlig beskattning"),
      "Dir. 2023:171"
    );
  });

  await t.step("Dir in URL slug format", () => {
    assertEquals(extractDocNumber("dir-2023-171"), "Dir. 2023:171");
  });
});

Deno.test("extractDocNumber - Proposition patterns", async (t) => {
  await t.step("basic Prop. format", () => {
    assertEquals(extractDocNumber("Prop. 2025/26:36"), "Prop. 2025/26:36");
  });

  await t.step("Prop without period", () => {
    assertEquals(extractDocNumber("Prop 2025/26:36"), "Prop. 2025/26:36");
  });

  await t.step("Prop with full title should only extract number", () => {
    assertEquals(
      extractDocNumber("Prop. 2025/26:36 Förstärkta åtgärder mot mäns våld mot kvinnor"),
      "Prop. 2025/26:36"
    );
  });

  await t.step("Prop with hyphen separators", () => {
    assertEquals(extractDocNumber("Prop. 2025-26:36"), "Prop. 2025/26:36");
  });
});

Deno.test("extractDocNumber - Ds patterns", async (t) => {
  await t.step("basic Ds format", () => {
    assertEquals(extractDocNumber("Ds 2024:15"), "Ds 2024:15");
  });

  await t.step("Ds with hyphen separator", () => {
    assertEquals(extractDocNumber("Ds 2024-15"), "Ds 2024:15");
  });

  await t.step("Ds with title", () => {
    assertEquals(
      extractDocNumber("Ds 2024:15 Nya regler om säkerhet i fråga om kärnteknisk verksamhet"),
      "Ds 2024:15"
    );
  });
});

Deno.test("extractDocNumber - Ministry dossier numbers", async (t) => {
  await t.step("Ju (Justitiedepartementet) dossier", () => {
    assertEquals(extractDocNumber("Ju2025/00680"), "Ju2025/00680");
  });

  await t.step("Fi (Finansdepartementet) dossier", () => {
    assertEquals(extractDocNumber("Fi2025/00974"), "Fi2025/00974");
  });

  await t.step("U (Utbildningsdepartementet) dossier", () => {
    assertEquals(extractDocNumber("U2025/02147"), "U2025/02147");
  });

  await t.step("S (Socialdepartementet) dossier", () => {
    assertEquals(extractDocNumber("S2024/12345"), "S2024/12345");
  });

  await t.step("dossier with title should only extract number", () => {
    assertEquals(
      extractDocNumber("Ju2025/00680 Sekretess för nya uppgifter i Schengens informationssystem"),
      "Ju2025/00680"
    );
  });

  await t.step("dossier in Lagstiftningskedja context", () => {
    assertEquals(
      extractDocNumber("Lagstiftningskedja: Fi2025/00974 Avvikande från tyst godkännande"),
      "Fi2025/00974"
    );
  });

  await t.step("dossier in Uppdrag context", () => {
    assertEquals(
      extractDocNumber("Uppdrag att utreda hur spetsutbildningar kan utformas, U2025/02147"),
      "U2025/02147"
    );
  });
});

Deno.test("extractDocNumber - FPM patterns", async (t) => {
  await t.step("basic FPM format", () => {
    assertEquals(extractDocNumber("2024/25:FPM12"), "2024/25:FPM12");
  });

  await t.step("FPM with space", () => {
    assertEquals(extractDocNumber("2024/25: FPM 12"), "2024/25:FPM12");
  });
});

Deno.test("extractDocNumber - should return null for non-document text", async (t) => {
  await t.step("generic Swedish text", () => {
    assertEquals(extractDocNumber("Om lagstiftningen i Sverige"), null);
  });

  await t.step("remiss text without doc number", () => {
    assertEquals(
      extractDocNumber("Remiss av promemorian Sekretess för nya uppgifter"),
      null
    );
  });

  await t.step("empty string", () => {
    assertEquals(extractDocNumber(""), null);
  });

  await t.step("generic uppdrag text without dossier number", () => {
    assertEquals(
      extractDocNumber("Uppdrag Utökade möjligheter att säga upp bostadsrättshavare"),
      null
    );
  });
});

Deno.test("extractDocNumber - HTML entity handling", async (t) => {
  await t.step("text with encoded Swedish characters", () => {
    assertEquals(
      extractDocNumber("SOU 2024:55 &#xD6;versyn av n&#xE5;got"),
      "SOU 2024:55"
    );
  });

  await t.step("text with named entities", () => {
    assertEquals(
      extractDocNumber("Dir. 2024:100 &Ouml;versikt &ouml;ver fr&aring;gan"),
      "Dir. 2024:100"
    );
  });
});

// ============================================
// decodeHtmlEntities tests
// ============================================

Deno.test("decodeHtmlEntities - Swedish characters", async (t) => {
  await t.step("lowercase Swedish vowels", () => {
    assertEquals(decodeHtmlEntities("&ouml;&aring;&auml;"), "öåä");
  });

  await t.step("uppercase Swedish vowels", () => {
    assertEquals(decodeHtmlEntities("&Ouml;&Aring;&Auml;"), "ÖÅÄ");
  });

  await t.step("numeric entities", () => {
    assertEquals(decodeHtmlEntities("&#xF6;&#xE5;&#xE4;"), "öåä");
  });

  await t.step("mixed entities in sentence", () => {
    assertEquals(
      decodeHtmlEntities("F&#xF6;r&#xE4;ndringar i &#xE5;tg&#xE4;rdsprogram"),
      "Förändringar i åtgärdsprogram"
    );
  });
});

// ============================================
// classifyGenvagLink tests
// ============================================

Deno.test("classifyGenvagLink - reference type classification", async (t) => {
  await t.step("directive link should be 'cites'", () => {
    const result = classifyGenvagLink({
      url: "https://www.regeringen.se/kommittedirektiv/2023/12/dir-2023-171/",
      anchorText: "Dir. 2023:171"
    });
    assertEquals(result.referenceType, "cites");
    assertEquals(result.targetDocNumber, "Dir. 2023:171");
  });

  await t.step("ändringar anchor text should be 'amends'", () => {
    const result = classifyGenvagLink({
      url: "https://www.regeringen.se/proposition/2025/01/prop-2025-26-36/",
      anchorText: "Ändringar i lagen"
    });
    assertEquals(result.referenceType, "amends");
  });

  await t.step("remissvar anchor text should be 'responds_to'", () => {
    const result = classifyGenvagLink({
      url: "https://www.regeringen.se/remisser/2024/01/remiss-test/",
      anchorText: "Remissvar på SOU 2024:55"
    });
    assertEquals(result.referenceType, "responds_to");
  });

  await t.step("press release should be external", () => {
    const result = classifyGenvagLink({
      url: "https://www.regeringen.se/pressmeddelanden/2024/01/test/",
      anchorText: "Pressmeddelande"
    });
    assertEquals(result.isExternalUrl, true);
    assertEquals(result.externalUrlType, "press_release");
  });
});

console.log("Run tests with: deno test supabase/functions/_shared/genvag-classifier.test.ts");
