/**
 * Edge Function: test-org-matcher
 * Runs unit tests for organization-matcher.ts
 * 
 * Returns test results as JSON
 */

import { calculateSimilarity, normalizeOrganizationName } from '../_shared/organization-matcher.ts?v=2.7.9.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Hyphen vs space normalization
  try {
    const score = calculateSimilarity("Dals Eds kommun", "Dals-Eds kommun");
    results.push({
      name: "calculateSimilarity: hyphen vs space normalization",
      passed: score === 1.0,
      expected: "1.0",
      actual: String(score)
    });
  } catch (e) {
    results.push({ name: "calculateSimilarity: hyphen vs space normalization", passed: false, error: String(e) });
  }

  // Test 2: Case insensitive
  try {
    const score = calculateSimilarity("TERACOM", "teracom");
    results.push({
      name: "calculateSimilarity: case insensitive",
      passed: score === 1.0,
      expected: "1.0",
      actual: String(score)
    });
  } catch (e) {
    results.push({ name: "calculateSimilarity: case insensitive", passed: false, error: String(e) });
  }

  // Test 3: Substring with high ratio
  try {
    const score = calculateSimilarity("Teracom", "Teracom AB");
    results.push({
      name: "calculateSimilarity: substring with high ratio",
      passed: score >= 0.8,
      expected: ">= 0.8",
      actual: String(score)
    });
  } catch (e) {
    results.push({ name: "calculateSimilarity: substring with high ratio", passed: false, error: String(e) });
  }

  // Test 4: Substring with low ratio rejected
  try {
    const score = calculateSimilarity("kommunal", "nätverket för kommunala lärcentra");
    results.push({
      name: "calculateSimilarity: substring with low ratio rejected",
      passed: score < 0.7,
      expected: "< 0.7",
      actual: String(score)
    });
  } catch (e) {
    results.push({ name: "calculateSimilarity: substring with low ratio rejected", passed: false, error: String(e) });
  }

  // Test 5: Possessive s not stripped from Nitus
  try {
    const result = normalizeOrganizationName("Nitus");
    results.push({
      name: "normalizeOrganizationName: possessive s not stripped from Nitus",
      passed: result === "Nitus",
      expected: "Nitus",
      actual: result
    });
  } catch (e) {
    results.push({ name: "normalizeOrganizationName: possessive s not stripped from Nitus", passed: false, error: String(e) });
  }

  // Test 6: Possessive s stripped from long names
  try {
    const result = normalizeOrganizationName("Riksarkivets");
    results.push({
      name: "normalizeOrganizationName: possessive s stripped from long names",
      passed: result === "Riksarkivet",
      expected: "Riksarkivet",
      actual: result
    });
  } catch (e) {
    results.push({ name: "normalizeOrganizationName: possessive s stripped from long names", passed: false, error: String(e) });
  }

  // Test 7: File extension stripped
  try {
    const result = normalizeOrganizationName("Teracom.pdf");
    results.push({
      name: "normalizeOrganizationName: file extension stripped",
      passed: result === "Teracom",
      expected: "Teracom",
      actual: result
    });
  } catch (e) {
    results.push({ name: "normalizeOrganizationName: file extension stripped", passed: false, error: String(e) });
  }

  // Test 8: Multiple hyphens/spaces
  try {
    const score = calculateSimilarity("A-B-C", "A B C");
    results.push({
      name: "calculateSimilarity: multiple hyphens/spaces",
      passed: score === 1.0,
      expected: "1.0",
      actual: String(score)
    });
  } catch (e) {
    results.push({ name: "calculateSimilarity: multiple hyphens/spaces", passed: false, error: String(e) });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const results = runTests();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return new Response(JSON.stringify({
      summary: {
        total: results.length,
        passed,
        failed,
        success: failed === 0
      },
      tests: results
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
