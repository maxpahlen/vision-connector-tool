-- ============================================
-- Phase 3.1b: Remove citation_quality view (security concern)
-- ============================================
--
-- The linter flagged the citation_quality view as a security concern.
-- For now, we'll remove it and add monitoring capabilities later via
-- admin-only edge functions that respect RLS properly.
--

DROP VIEW IF EXISTS citation_quality;

-- Note: Citation monitoring can be done via admin edge functions
-- that query the tables directly with proper authentication checks.
