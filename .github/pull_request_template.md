## Phase Delta

**Phase:** [e.g., Phase 5.3]  
**Since Last Sync:**
- 
- 
- 

---

## Scope

**What this PR does:**


**What this PR does NOT do:**


---

## Approval Checklist

### Scope & Impact
- [ ] Scope is clearly defined above
- [ ] No unrelated changes included

### Files Touched
- [ ] List of modified files reviewed
- [ ] No accidental file changes

### Tests Planned
| Test Description | Responsibility |
|------------------|----------------|
| | [Codex-runs] |
| | [Lovable-runs] |

### DB Impact
- [ ] **No DB changes** — Skip to Approvals
- [ ] **DB changes included** — Lovable confirmation required below

If DB changes:
- [ ] Migration reviewed by Lovable
- [ ] RLS implications considered
- [ ] Rollback migration prepared

**Lovable DB Confirmation:** _Pending / Confirmed_

### Rollback Note
<!-- How to rollback if this causes issues -->


---

## Blocked Paths Touched

> ⚠️ If ANY box is checked, this PR **requires Lovable AGREE before merge**

- [ ] `supabase/functions/*`
- [ ] `supabase/migrations/*`
- [ ] `src/integrations/supabase/*`
- [ ] Auth/session/permission logic
- [ ] New tables or columns (schema changes)
- [ ] DB-dependent background jobs

**Blocked paths touched:** _None / Listed above_

---

## Approvals

> All three approvals required before merge

- [ ] **AGREE – Max**
- [ ] **AGREE – Lovable**
- [ ] **AGREE – Codex**

---

## Verification Status

### App-Level [Codex-runs]
- [ ] Compiles without errors
- [ ] No TypeScript warnings
- [ ] No console errors
- [ ] Core flows tested
- [ ] Responsive check done

### Data-Layer [Lovable-runs]
<!-- Only if DB changes -->
- [ ] Migration successful
- [ ] RLS tested (auth + anon)
- [ ] No RLS recursion
- [ ] FK constraints verified
- [ ] Data not corrupted
- [ ] Rollback tested

---

## Additional Notes

<!-- Any context, known issues, or follow-up items -->
