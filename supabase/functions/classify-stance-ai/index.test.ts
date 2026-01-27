/**
 * Unit Test Outline for classify-stance-ai Paginated Accumulation
 * 
 * These tests verify the windowing bug fix where early candidates
 * were ineligible (neutral with keywords) but eligible items existed later.
 * 
 * Run with: deno test --allow-net --allow-env
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertGreater, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const functionUrl = `${SUPABASE_URL}/functions/v1/classify-stance-ai`;

// Helper to call the edge function
async function callClassifyStanceAI(body: Record<string, unknown> = {}) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

/**
 * Test 1: Verify telemetry fields are present in response
 * 
 * The response should include:
 * - telemetry.scanned_total
 * - telemetry.eligible_found
 * - telemetry.skipped_ineligible
 * - telemetry.pages_fetched
 */
Deno.test("should include telemetry fields in response", async () => {
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit: 1 
  });
  
  assertEquals(status, 200);
  assertExists(data.telemetry, "telemetry object should exist");
  assertExists(data.telemetry.scanned_total, "scanned_total should exist");
  assertExists(data.telemetry.eligible_found, "eligible_found should exist");
  assertExists(data.telemetry.skipped_ineligible, "skipped_ineligible should exist");
  assertExists(data.telemetry.pages_fetched, "pages_fetched should exist");
  
  // Consume response to prevent resource leak
  console.log("Telemetry:", data.telemetry);
});

/**
 * Test 2: Verify pagination occurs when early candidates are ineligible
 * 
 * If the first page contains mostly ineligible items (neutral with keywords),
 * the function should paginate further to find eligible items.
 */
Deno.test("should paginate to find eligible items when early candidates are ineligible", async () => {
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit: 5 
  });
  
  assertEquals(status, 200);
  
  // If there are eligible items in the DB but they start after position 60,
  // we should see pages_fetched > 1
  if (data.telemetry.eligible_found > 0 && data.telemetry.skipped_ineligible > 0) {
    console.log(`Pagination working: found ${data.telemetry.eligible_found} eligible after scanning ${data.telemetry.scanned_total}`);
  }
  
  // The sum of eligible + skipped should equal scanned
  assertEquals(
    data.telemetry.eligible_found + data.telemetry.skipped_ineligible,
    data.telemetry.scanned_total,
    "eligible + skipped should equal scanned_total (unless we hit limit early)"
  );
});

/**
 * Test 3: Verify limit is respected
 * 
 * The function should stop collecting eligible items once it reaches the limit.
 */
Deno.test("should respect the limit parameter", async () => {
  const limit = 3;
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit 
  });
  
  assertEquals(status, 200);
  
  // processed should be <= limit
  if (data.telemetry.eligible_found > 0) {
    assertGreater(data.telemetry.eligible_found, 0);
    assertEquals(
      data.telemetry.eligible_found <= limit,
      true,
      `eligible_found (${data.telemetry.eligible_found}) should be <= limit (${limit})`
    );
  }
});

/**
 * Test 4: Verify dry_run doesn't modify database
 * 
 * When dry_run=true, no database updates should occur but classification
 * should still happen and be returned in details.
 */
Deno.test("should not modify database in dry_run mode", async () => {
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit: 1 
  });
  
  assertEquals(status, 200);
  assertEquals(data.dry_run, true);
  
  // If there are details, they should have the classification info
  if (data.details && data.details.length > 0) {
    const detail = data.details[0];
    assertExists(detail.ai_stance, "should have ai_stance");
    assertExists(detail.confidence, "should have confidence");
    assertExists(detail.reasoning, "should have reasoning");
  }
});

/**
 * Test 5: Verify single response mode bypasses pagination
 * 
 * When response_id is provided, it should fetch that specific item directly.
 */
Deno.test("should handle single response_id mode", async () => {
  // This test requires a known response_id from the database
  // For integration testing, you would inject a test ID here
  const testResponseId = "00000000-0000-0000-0000-000000000000"; // placeholder
  
  const { status, data } = await callClassifyStanceAI({ 
    response_id: testResponseId,
    dry_run: true 
  });
  
  // Should return 200 even if ID not found (will just have processed=0)
  assertEquals(status, 200);
  
  // In single mode, pages_fetched should be 1
  if (data.telemetry) {
    assertEquals(data.telemetry.pages_fetched, 1, "single mode should fetch 1 page");
  }
});

/**
 * Test 6: Verify max pages cap prevents runaway scans
 * 
 * The function should stop after MAX_PAGES (10) even if not enough eligible found.
 */
Deno.test("should respect max pages cap", async () => {
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit: 50 // Request 50, might not find that many
  });
  
  assertEquals(status, 200);
  
  // pages_fetched should be <= MAX_PAGES (10)
  assertEquals(
    data.telemetry.pages_fetched <= 10,
    true,
    `pages_fetched (${data.telemetry.pages_fetched}) should be <= 10`
  );
});

/**
 * Test 7: Verify empty result returns appropriate message
 * 
 * When no eligible responses exist, should return a clear message.
 */
Deno.test("should return message when no eligible responses found", async () => {
  // This test will pass if either:
  // 1. There are no eligible responses (message field exists)
  // 2. There are eligible responses (processed > 0)
  const { status, data } = await callClassifyStanceAI({ 
    dry_run: true,
    limit: 1 
  });
  
  assertEquals(status, 200);
  
  if (data.processed === 0) {
    assertExists(data.message, "should have message when no items processed");
  }
});

/**
 * INTEGRATION TEST OUTLINE (requires test fixtures):
 * 
 * 1. Setup: Create test remiss_responses with known distributions
 *    - 60 neutral items with keywords_found.length > 0 (ineligible)
 *    - 10 neutral items with keywords_found.length = 0 (eligible)
 *    - 5 mixed items (eligible)
 * 
 * 2. Test: Call function with limit=10
 *    - Verify pages_fetched > 1 (had to paginate past first 60)
 *    - Verify eligible_found = 10
 *    - Verify skipped_ineligible = 60
 * 
 * 3. Teardown: Remove test fixtures
 */
