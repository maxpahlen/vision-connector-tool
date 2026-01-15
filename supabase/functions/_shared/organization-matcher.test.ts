/**
 * Unit tests for organization-matcher.ts
 * Run with: deno test --allow-env supabase/functions/_shared/organization-matcher.test.ts
 * 
 * Phase 2.7.9.1: Added tests for hyphen normalization to prevent regression
 */

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { calculateSimilarity, normalizeOrganizationName } from "./organization-matcher.ts";

// ============================================
// # Protected Code - Do Not Edit
// These tests lock in critical bug fixes
// ============================================

Deno.test("calculateSimilarity: hyphen vs space normalization", () => {
  // Critical regression test for Dals-Eds kommun issue
  const score = calculateSimilarity("Dals Eds kommun", "Dals-Eds kommun");
  assertEquals(score, 1.0, "Hyphen and space variants should be exact match");
});

Deno.test("calculateSimilarity: case insensitive", () => {
  const score = calculateSimilarity("TERACOM", "teracom");
  assertEquals(score, 1.0, "Case should not affect matching");
});

Deno.test("calculateSimilarity: substring with high ratio", () => {
  // "Teracom" is ~64% of "Teracom AB" - should match with high score
  const score = calculateSimilarity("Teracom", "Teracom AB");
  assertEquals(score >= 0.8, true, `Expected >= 0.8, got ${score}`);
});

Deno.test("calculateSimilarity: substring with low ratio rejected", () => {
  // "kommunal" is ~17% of full string - should NOT get substring bonus
  const score = calculateSimilarity("kommunal", "nätverket för kommunala lärcentra");
  assertEquals(score < 0.7, true, `Expected < 0.7, got ${score} - false positive risk`);
});

Deno.test("normalizeOrganizationName: possessive s not stripped from Nitus", () => {
  const result = normalizeOrganizationName("Nitus");
  assertEquals(result, "Nitus", "Short names ending in 's' should not be stripped");
});

Deno.test("normalizeOrganizationName: possessive s stripped from long names", () => {
  const result = normalizeOrganizationName("Riksarkivets");
  assertEquals(result, "Riksarkivet", "Possessive 's' should be stripped from long names");
});

Deno.test("normalizeOrganizationName: file extension stripped", () => {
  const result = normalizeOrganizationName("Teracom.pdf");
  assertEquals(result, "Teracom", "File extensions should be stripped");
});
