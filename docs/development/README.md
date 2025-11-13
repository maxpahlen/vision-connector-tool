# Development Workflow Guide

## Overview

This directory contains the branch management system for the vision-connector-tool.lovable project. The system enforces development discipline and prevents scope creep by clearly defining the purpose and boundaries of each branch.

## Quick Start

### Starting New Work

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Create a branch plan**
   ```bash
   cd docs/development/branches
   cp template-branch-plan.md your-feature-name.md
   ```

3. **Fill in the plan**
   - Define the goal
   - Set clear scope boundaries
   - List success criteria
   - Note any out-of-scope items

4. **Update current reference** (optional, for your workflow)
   - Point `current-branch.md` to your active plan
   - This helps the AI understand your current context

### During Development

- **Before making changes**: Verify they align with your branch plan
- **If scope changes**: Update the branch plan document first
- **New unrelated work**: Create a new branch instead of expanding scope

### Completing Work

1. **Test thoroughly**: All tests must pass
2. **Merge to alpha/beta**: For integration testing
3. **Archive the plan**: Move to `completed/` folder
4. **Merge to main**: Only after validation

## Directory Structure

```
docs/development/
├── README.md                    # This file
├── branch-rules.md              # General rules for ALL branches
├── branches/
│   ├── template-branch-plan.md  # Template for new branch plans
│   ├── main.md                  # Main branch rules (read-only)
│   ├── current-branch.md        # Pointer to active branch (git-ignored)
│   └── [feature-name].md        # Individual branch plans
└── completed/
    └── [archived-plans].md      # Historical record of completed work
```

## Key Principles

### 1. One Branch, One Purpose
Each branch should have a single, well-defined goal. Resist the temptation to "just add one more thing."

### 2. No Development in Main
Main branch is sacred. It represents production-ready code. All development happens in feature branches.

### 3. Document Before Code
Write the branch plan before starting work. It clarifies thinking and prevents scope creep.

### 4. AI-Enforced Boundaries
The AI assistant reads branch plans and helps enforce scope discipline. This is a feature, not a limitation.

### 5. Test Everything
Follow the testing strategy in `docs/technical/testing-strategy.md`. All tests must pass before merging.

## Branch Types

### Feature Branches
- **Naming**: `feature/descriptive-name`
- **Purpose**: New functionality
- **Merge to**: `alpha-release` → `main`

### Fix Branches
- **Naming**: `fix/issue-description`
- **Purpose**: Bug fixes
- **Merge to**: `alpha-release` → `main`

### Refactor Branches
- **Naming**: `refactor/what-is-being-refactored`
- **Purpose**: Code improvements without changing behavior
- **Merge to**: `alpha-release` → `main`

### Release Branches
- **alpha-release**: Integration testing
- **beta-release**: User acceptance testing
- **main**: Production-ready code

## Integration with AI Assistant

The AI assistant has been configured to:
1. Read `branch-rules.md` for general guidelines
2. Check the current branch plan before making changes
3. Validate that proposed changes align with branch scope
4. Ask for clarification when changes seem out of scope

To enable this, add the following to **Project Settings → Manage Knowledge**:

```markdown
# Branch Management

Before making ANY code changes:
1. Read `docs/development/branch-rules.md` for general rules
2. Read `docs/development/branches/current-branch.md` for current branch scope
3. Verify the proposed change aligns with the branch plan
4. If it doesn't align, stop and discuss with the developer

**Critical Rule**: No development in main branch. All work happens in feature branches.
```

## Best Practices

### ✅ DO
- Write branch plans before coding
- Keep scope narrow and focused
- Update plans when requirements change
- Archive completed plans for history
- Reference the testing strategy
- Ask for scope clarification when unsure

### ❌ DON'T
- Develop directly in main branch
- Add "just one more thing" to a branch
- Start coding without a plan
- Ignore test failures
- Mix unrelated changes in one branch
- Delete completed plans (archive them instead)

## Questions?

For technical documentation, see:
- `docs/technical/README.md` - System architecture
- `docs/technical/testing-strategy.md` - Testing approach
- `docs/technical/database-design.md` - Database schema

For branch-specific questions, consult the relevant branch plan in `branches/`.
