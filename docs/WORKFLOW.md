# Operating Agreement & Workflow

**Effective Date:** 2026-01-05  
**Last Updated:** 2026-01-05

---

## Roles & Authority

### Maximilian (Human) — Head Developer
- **Authority:** Final decision-maker on all matters
- **Responsibilities:**
  - Approves scope and priority changes
  - Makes executive decisions when partners disagree
  - Reviews roadmap and strategic direction

### Lovable — Architectural Authority
- **Authority:** SOLE owner of DB/migrations/RLS/storage
- **Responsibilities:**
  - Database schema changes and migrations
  - RLS policy design and implementation
  - Storage configuration
  - Data integrity and data-dependent testing
  - Architectural drift detection and review
  - Reviewing Codex's work for data safety

### Codex — Execution Coder
- **Authority:** App-level code implementation via GitHub
- **Responsibilities:**
  - Frontend components and UI logic
  - App-level business logic (non-DB)
  - App-level documentation
  - Running app-level tests

---

## Four-Phase Workflow

All changes follow this mandatory sequence:

### 1. PROPOSAL
- Options and tradeoffs are discussed
- **No code changes permitted**
- All partners review and ask questions

### 2. APPROVAL
- Explicit "AGREE" required from ALL THREE partners:
  - AGREE – Max
  - AGREE – Lovable
  - AGREE – Codex
- **"No clear AGREE = stop"** — if any partner has not explicitly agreed, do not proceed

### 3. EXECUTION
- Code is written only after approval
- Follow the approved scope exactly
- Document changes in phase delta format

### 4. VERIFICATION
- Lovable reviews:
  - Own work
  - Codex's work (for architectural drift)
  - DB, RLS, storage, and data correctness
- Codex runs app-level verification checklist
- Both checklists must pass before marking done

---

## Message Discipline (MANDATORY)

Every message from Lovable MUST begin with:

```
Message Type: [TYPE] | Phase: [PHASE]
```

### Message Types
| Type | When to Use |
|------|-------------|
| `PROPOSAL` | Presenting options, discussing tradeoffs |
| `APPROVAL REQUEST` | Asking for explicit AGREE from partners |
| `APPROVAL` | Confirming own AGREE to a proposal |
| `EXECUTION PLAN` | Detailing what will be implemented |
| `EXECUTION UPDATE` | Progress during implementation |
| `VERIFICATION` | Reporting verification results |
| `QUESTION` | Clarifying ambiguity (escalating uncertainty) |
| `BLOCKING` | Blocked and cannot proceed |

### Examples

```
Message Type: PROPOSAL | Phase: PROPOSAL

I propose we add a new `status` column to remiss_documents...
```

```
Message Type: BLOCKING | Phase: EXECUTION

#blocking-missing-api-key

Cannot proceed with scraper implementation. The OPENAI_API_KEY secret is not configured...
```

```
Message Type: VERIFICATION | Phase: VERIFICATION

Verification complete for PR #42:
- [x] Migration executes successfully
- [x] RLS tested for authenticated users
...
```

---

## Context Inclusion Rule (MANDATORY)

When Lovable sends a message with:
- `Message Type: PROPOSAL`
- `Phase: PROPOSAL`
- AND the proposal is in response to a prompt from Maximilian

Lovable **MUST** include Max's original prompt text **verbatim** inside the proposal message.

### Implementation

1. Include a clearly labeled section:
   ```
   ## Original Prompt (verbatim)
   <paste Max's exact text here>
   ```
2. Do NOT paraphrase, summarize, or reinterpret the prompt
3. The original text must be copied exactly

### Purpose

- Prevent context drift between Codex and Lovable
- Allow proposals to be forwarded without loss of intent
- Reduce need to restate instructions
- Preserve clear instruction → proposal lineage

### Does NOT Apply To

- APPROVAL, EXECUTION, or VERIFICATION messages
- Clarifying questions
- Unprompted suggestions

---

## Blocking Rules

When blocked, use:
- Message Type: `BLOCKING`
- Include marker: `#blocking-<reason>`

Examples:
- `#blocking-missing-secret`
- `#blocking-unclear-requirements`
- `#blocking-waiting-codex-confirmation`

**Do NOT proceed past a blocking issue without resolution.**

---

## Architectural Drift Detection

### Paths Requiring Lovable Review

Any changes touching the following ALWAYS require explicit Lovable AGREE before execution or merge:

- `supabase/functions/*`
- `supabase/migrations/*`
- `src/integrations/supabase/*`
- Auth/session/permission behavior
- New tables or columns
- DB-dependent background jobs or schedulers

### Review Process

1. Codex flags the change as touching a blocked path
2. Lovable reviews for:
   - Schema correctness
   - RLS policy implications
   - Data integrity risks
   - Rollback feasibility
3. Lovable provides explicit AGREE or requests changes

---

## Core Principles

### No-Surprises Rule
Any change that would surprise Max on review should have been discussed first.

### Uncertainty Discipline
- Do NOT assume intent
- Do NOT guess
- Escalate ambiguity to Max

### Stability Over Speed
Prefer correctness and stability over fast delivery.

---

## Documentation Responsibilities

| Area | Owner |
|------|-------|
| DB schema docs | Lovable |
| RLS policy docs | Lovable |
| Storage docs | Lovable |
| PRODUCT_ROADMAP data metrics | Lovable |
| App-level docs | Codex |
| Roadmap scope/priority approval | Max |

---

## Decision Recording

All approved decisions are recorded in `docs/DECISION_LOG.md` with:
- Date
- Change title
- PR/Issue link
- Risk classification
- Triple approval signatures
