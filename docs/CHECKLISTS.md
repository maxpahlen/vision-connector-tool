# Verification Checklists

Standard checklists for verifying changes before marking work as complete.

---

## A. App-Level Verification Checklist [Codex-runs]

Use this checklist for frontend, UI, and app-level logic changes.

```markdown
### App-Level Verification

- [ ] Code compiles/builds without errors
- [ ] No TypeScript warnings
- [ ] No runtime console errors
- [ ] Core user flows tested manually
- [ ] Responsive design sanity-checked (mobile, tablet, desktop)
- [ ] No regressions in existing functionality
- [ ] Loading states render correctly
- [ ] Error states handled gracefully
```

### When to Use
- All frontend component changes
- UI/UX modifications
- Client-side business logic
- Styling and layout changes

---

## B. Data-Layer Verification Checklist [Lovable-runs]

Use this checklist for any changes touching database, RLS, storage, or data-dependent logic.

```markdown
### Data-Layer Verification

- [ ] Migration executes successfully
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] RLS policies tested for authenticated users
- [ ] RLS policies tested for anonymous users
- [ ] No infinite recursion in RLS policies
- [ ] Foreign key constraints verified
- [ ] Existing data not corrupted
- [ ] Rollback migration prepared and tested
- [ ] Index/performance sanity check (EXPLAIN for new query patterns)
- [ ] Edge function deploys successfully (if applicable)
- [ ] Edge function returns expected responses (if applicable)
```

### When to Use
- Any database schema changes
- RLS policy additions or modifications
- Storage bucket or policy changes
- Edge function changes
- Any code that queries or mutates database state

---

## C. Combined Verification (Cross-Stack Changes)

For changes spanning both app-level and data-layer:

1. **Lovable completes Data-Layer Verification first**
2. **Codex completes App-Level Verification second**
3. **Both sign off before marking complete**

```markdown
### Combined Verification

#### Data-Layer [Lovable-runs]
- [ ] All Data-Layer Verification items passed

#### App-Level [Codex-runs]
- [ ] All App-Level Verification items passed

#### Integration
- [ ] Frontend correctly handles new data structures
- [ ] Error states from backend handled in UI
- [ ] No type mismatches between frontend and backend
```

---

## D. Pre-Merge Sanity Check

Before any PR is merged:

```markdown
### Pre-Merge Sanity

- [ ] All verification checklists completed
- [ ] Triple approval obtained (Max, Lovable, Codex)
- [ ] Phase delta documented
- [ ] No blocking issues outstanding
- [ ] Rollback plan documented (if Data Risk > NONE)
```
