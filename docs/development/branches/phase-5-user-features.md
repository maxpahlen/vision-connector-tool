# Phase 5: User Features & Collaboration

> **📋 DEFERRED — NOT CURRENTLY PLANNED**
> 
> This document describes potential user collaboration features that were conceptualized but have been deferred indefinitely. The "Phase 5" naming conflicts with the Legislative Graph Expansion work (the actual Phase 5). Consider this document as a future feature wishlist, not an active phase.

---

**Status:** Archived / Deferred  
**Branch:** None (not implemented)  
**Dependencies:** Phase 3 (AI System), Phase 4 (Search)

---

## Purpose

Transform Transparency from a read-only research tool into a collaborative platform where users can contribute knowledge, save insights, and work together on legislative analysis.

**Note:** Current development priority is completing the legislative graph (Phase 5.4: Committee Reports + Laws) and moving to relationship inference (Phase 6).

---

## Rough Goals (If Implemented)

### 1. User Accounts & Profiles
- Extended profiles with organization affiliation
- Areas of interest (ministries, topics)
- Notification preferences

### 2. Saved Searches & Alerts
- Save search queries with filters
- Email/in-app notifications for new matches

### 3. Annotations & Notes
- Private notes on documents, events, entities
- Optional sharing with team/organization

### 4. Collections & Bookmarks
- Custom collections of processes
- Tag and organize for research projects

### 5. Discussion & Comments
- Comment threads on processes
- @mention other users

### 6. Collaboration Features
- Share collections with colleagues
- Organization-level shared workspaces

---

## Technical Considerations (For Reference)

### User-Generated Content Tables

```sql
-- User annotations
CREATE TABLE annotations (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  target_type text, -- 'document', 'event', 'entity'
  target_id uuid,
  content text,
  visibility text DEFAULT 'private'
);

-- Saved searches
CREATE TABLE saved_searches (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  name text,
  query_params jsonb,
  notify_on_new boolean DEFAULT false
);

-- User collections
CREATE TABLE collections (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  name text,
  visibility text DEFAULT 'private'
);
```

---

## Open Questions (Unresolved)

1. **Organization model:** How to structure multi-user orgs?
2. **Notification volume:** Risk of spam with many saved searches?
3. **Moderation:** If comments are public, who moderates?
4. **Export formats:** What do users need?

---

## Related Documentation

- `docs/development/PRODUCT_ROADMAP.md` - Current active phases
- `docs/development/branches/phase-5-legislative-graph-expansion.md` - Actual Phase 5
- `docs/development/branches/phase-6-relationship-inference.md` - Next major phase
