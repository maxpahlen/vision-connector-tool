# Main Branch Rules

## Branch Information
- **Branch Name**: `main`
- **Status**: Protected - Production Ready Code Only

## Purpose
The main branch represents production-ready, fully tested code. It is the stable version of the application that can be deployed to users at any time.

## Rules

### No Direct Development
- **NEVER** develop features directly in main
- **NEVER** commit untested code to main
- **NEVER** use main for experimentation

### Merge Requirements
All merges to main must:
- ✅ Come from `alpha-release` or `beta-release` branches
- ✅ Have all tests passing
- ✅ Be fully documented
- ✅ Have completed code review (if team workflow)
- ✅ Have verified functionality in staging environment

### What Main Contains
- Fully functional, tested features
- Complete documentation
- Passing test suites
- Stable, deployable code
- Proper RLS policies and security measures

### What Main Does NOT Contain
- Work in progress
- Experimental features
- Untested code
- Known bugs (unless documented and accepted)
- Half-implemented features

## Workflow Integration

```
feature/branch → alpha-release → beta-release → main
                      ↓               ↓           ↓
                   Testing      User Testing   Production
```

## Protected Status
- Main branch should be protected in git settings
- Require pull request reviews
- Enforce status checks before merging
- Prevent force pushes

## Emergency Fixes
For critical production bugs:
1. Create `fix/critical-issue` branch from main
2. Implement minimal fix
3. Test thoroughly
4. Merge to alpha-release first
5. Fast-track through beta to main if verified

## Reference
See `docs/development/README.md` for complete workflow documentation.
