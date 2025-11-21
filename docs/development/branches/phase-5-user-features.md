# Phase 5: User Features & Collaboration

**Status:** Planning  
**Branch:** `phase-5-user-features`  
**Dependencies:** Phase 3 (AI System), Phase 4 (Search)

---

## Purpose

Transform Transparency from a read-only research tool into a collaborative platform where users can contribute knowledge, save insights, and work together on legislative analysis.

---

## Rough Goals

### 1. User Accounts & Profiles
- Extended profiles with:
  - Organization affiliation
  - Areas of interest (ministries, topics)
  - Notification preferences
- User activity tracking (searches, views, annotations)

### 2. Saved Searches & Alerts
- Save search queries with filters
- Email/in-app notifications when:
  - New SOU matches saved search
  - Process stage changes on watched processes
  - New events added to timeline

### 3. Annotations & Notes
- Users can add private notes to:
  - Documents
  - Timeline events
  - Entities
- Optionally share notes with team/organization

### 4. Collections & Bookmarks
- Create custom collections of processes
- Tag and organize for research projects
- Export collections to reports

### 5. Discussion & Comments
- Comment threads on processes
- @mention other users
- Link comments to specific citations

### 6. Collaboration Features
- Share collections with colleagues
- Collaborative annotation (Google Docs-style)
- Organization-level shared workspaces

---

## Interaction with Phase 3 Data

### User-Generated Content Tables

```sql
-- User annotations
CREATE TABLE annotations (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  target_type text, -- 'document', 'event', 'entity'
  target_id uuid,
  content text,
  visibility text DEFAULT 'private', -- 'private', 'shared', 'public'
  created_at timestamptz DEFAULT now()
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
  description text,
  visibility text DEFAULT 'private'
);

CREATE TABLE collection_items (
  collection_id uuid REFERENCES collections(id),
  process_id uuid REFERENCES processes(id),
  added_at timestamptz DEFAULT now()
);
```

### Integration with Existing Data
- Annotations link to `documents`, `timeline_events`, `entities`
- Saved searches use same filters as Phase 4 search
- Notifications triggered by changes to `processes.current_stage`

---

## Technical Considerations

### Real-Time Notifications
- Use Supabase Realtime for in-app notifications
- Email queue using background jobs
- Websocket connections for live updates

### Privacy & Permissions
- RLS policies for annotations (user can only see own or shared)
- Organization-level data isolation
- Admin controls for public sharing

### Performance
- Denormalize frequently accessed user data
- Cache user preferences
- Lazy load annotation threads

---

## Open Questions

1. **Organization model:** How to structure multi-user orgs?
   - Simple: `profiles.organization` (text field)
   - Complex: Separate `organizations` table with roles

2. **Notification volume:** Risk of spam with many saved searches?
   - Daily digest option
   - Rate limiting on notifications
   - Smart grouping ("3 new matches today")

3. **Moderation:** If comments are public, who moderates?
   - Admin role with moderation tools
   - Report/flag system
   - Start with organization-only comments

4. **Export formats:** What do users need?
   - PDF reports with citations
   - CSV for data analysis
   - Integration with Zotero/reference managers

---

## Success Criteria

- [ ] Users can save searches and receive useful notifications
- [ ] Annotation system enables meaningful note-taking
- [ ] Collections help users organize research projects
- [ ] Collaboration features foster knowledge sharing
- [ ] User activity doesn't impact system performance

---

## Future Enhancements

- AI-powered note suggestions
- Automatic tagging of user interests
- Integration with external tools (Slack, Teams)
- Public knowledge base mode
