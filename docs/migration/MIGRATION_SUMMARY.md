# LENGOLF VIP Migration Summary
*Production RLS Enablement & VIP Feature Migration*

## Migration Overview

This folder contains all documentation for migrating the LENGOLF VIP features from staging tables (with RLS) to production tables (without RLS). The migration is based **entirely on production data** with no staging data synchronization required.

## Document Guide

### 1. [RLS_MIGRATION_DEPLOYMENT_PLAN.md](./RLS_MIGRATION_DEPLOYMENT_PLAN.md)
**The main deployment playbook** - Contains:
- Step-by-step migration checklist with progress tracking
- Exact RLS policies to be applied to production tables
- 2-3 hour execution timeline with critical checkpoints
- Rollback procedures and emergency scripts
- Git workflow from `vip` → `main` branch deployment

### 2. [DATA_MIGRATION_ANALYSIS.md](./DATA_MIGRATION_ANALYSIS.md)
**Detailed data migration requirements** - Contains:
- Specific SQL scripts for data migration
- Production table schema updates required
- Marketing preference migration (defaults to FALSE)
- Data validation queries and rollback scripts
- Risk assessment and mitigation strategies

## Migration Scope

### What's Being Migrated
1. **RLS Policies**: Enable Row Level Security on all production tables
2. **VIP Customer Data**: Create VIP records for all users from production data
3. **Marketing Preferences**: Migrate to VIP data with FALSE default
4. **Schema Changes**: Add `vip_customer_data_id` to production profiles
5. **Application Code**: Update table references from staging to production

### What's NOT Being Migrated
- ❌ No staging data synchronization
- ❌ No copying of staging table data to production
- ❌ No dependency on staging tables after migration

## Key Changes Summary

### Database Changes
```sql
-- Add to production profiles table
ALTER TABLE public.profiles 
ADD COLUMN vip_customer_data_id UUID REFERENCES public.vip_customer_data(id);

-- Remove from production profiles table (after migration)
ALTER TABLE public.profiles DROP COLUMN marketing_preference;

-- Enable RLS on all production tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customer_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
```

### Code Changes
**16 files require table reference updates** - See [CODE_CHANGES_CHECKLIST.md](./CODE_CHANGES_CHECKLIST.md) for complete details:

```bash
# Table reference updates needed across:
profiles_vip_staging → profiles          # 9 API routes + 2 frontend + utils
bookings_vip_staging → bookings          # 6 API routes + 1 frontend + scripts  
crm_customer_mapping_vip_staging → crm_customer_mapping  # 4 API routes + utils
crm_packages_vip_staging → crm_packages  # 2 API routes + utils + scripts
```

**Files affected:** API routes (9), Frontend components (2), Utility functions (2), Scripts (2), Service files (1)

### Marketing Preference Default
- **Previous**: Marketing preferences defaulted to `true`
- **New**: All new VIP customer data records default to `vip_marketing_preference = false`
- **Existing**: Preserved from production profiles table

## Critical Success Factors

### Pre-Migration Requirements
- [ ] Production database backup completed
- [ ] All bookings have `user_id` populated (already verified: 100%)
- [ ] All CRM mappings have required fields (already verified: 100%)
- [ ] VIP branch code ready for production deployment
- [ ] Rollback procedures tested

### Critical Checkpoints During Migration
1. **User Authentication**: Must work after profiles RLS enablement
2. **Booking Operations**: Create/retrieve must work after bookings RLS 
3. **VIP Portal Access**: Must load without errors after deployment
4. **Data Security**: No unauthorized access possible after RLS

### Success Metrics
- **Performance**: <500ms API response time (95th percentile)
- **Reliability**: >99.9% authentication success rate
- **Security**: 100% RLS policy coverage, zero unauthorized access
- **Data Integrity**: 100% profiles linked to VIP customer data
- **Marketing Compliance**: All new VIP records default marketing_preference = FALSE

## Timeline Overview

### Pre-Migration (Day Before)
- Code preparation and branch setup
- Environment verification
- Team coordination

### Migration Day (2-3 Hours)
- **Hour 1**: Database migration and RLS enablement
- **Hour 1.5**: Application deployment and immediate testing
- **Hour 2**: VIP feature testing and validation
- **Hour 2.5**: Final validation and monitoring setup

### Post-Migration (24 Hours)
- Continuous monitoring and performance tracking
- User behavior analysis
- Support ticket monitoring

## Risk Assessment

### High Risk
- **Marketing Preference Data Loss**: Mitigated by comprehensive migration before column removal
- **Authentication Failures**: Mitigated by critical checkpoints and immediate rollback capability
- **VIP Feature Breakage**: Mitigated by extensive testing at each phase

### Medium Risk  
- **Performance Impact**: Mitigated by database indexing and query optimization
- **User Experience Disruption**: Mitigated by maintenance window and user communication

### Low Risk
- **Data Duplication**: Prevented by NOT EXISTS clauses in migration scripts
- **Orphaned Records**: Prevented by comprehensive validation queries

## Rollback Strategy

### Emergency Rollback Triggers
- User authentication failure rate > 1%
- API response times > 2 seconds consistently
- VIP portal completely inaccessible
- Data corruption detected

### Rollback Procedures
1. **Database**: Disable RLS on all production tables (5 minutes)
2. **Application**: Revert to previous Vercel deployment (2 minutes)
3. **Data**: Restore marketing preferences to profiles table (10 minutes)

## Team Responsibilities

### Backend Developer
- Execute data migration SQL scripts
- Apply RLS policies to production tables
- Monitor database performance and integrity

### Frontend Developer  
- Deploy VIP code changes to production
- Update table references in application code
- Conduct VIP feature testing

### DevOps Engineer
- Manage Vercel production deployment
- Monitor application performance and errors
- Coordinate rollback if needed

## Post-Migration Tasks

### Immediate (0-24 hours)
- Monitor all critical metrics
- Address any performance issues
- Update documentation
- Customer support awareness

### Short-term (1-2 weeks)
- Complete security audit
- Optimize any identified performance bottlenecks
- Plan LIFF integration implementation
- Remove staging table dependencies

### Long-term (1+ months)
- Decommission staging tables
- Implement additional VIP features
- Performance analysis and optimization
- User adoption analysis

---

**Migration Status**: Ready for execution
**Next Milestone**: Schedule migration window and execute deployment plan
**Estimated Total Time**: 2-3 hours active migration + 24 hours monitoring

*All migration documents are current as of January 2025 and reflect the production-only migration approach with FALSE marketing preference defaults.* 