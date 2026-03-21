# CPG-Store Relations and Campaign Store Enrollment

## Overview

This document describes the system for managing relationships between CPGs (Consumer Packaged Goods companies) and Stores, as well as the campaign targeting and enrollment system for stores.

## Business Rules

1. **One Store can sell products from multiple CPGs** - A store can have relationships with many CPGs
2. **One CPG can be sold in many Stores** - A CPG can have relationships with many stores
3. **Relation is created on first activity** - When a store makes a transaction with products from a CPG, a relation is automatically created
4. **Store can see campaigns from related CPGs** - But only if the campaign is visible to the store
5. **Store must be enrolled to participate** - Unless the campaign is configured with `auto_enroll`
6. **Campaigns are evaluated per CPG** - Each campaign only evaluates products from its own CPG

## Database Schema

### cpg_store_relations

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| cpg_id | uuid | FK to cpgs |
| store_id | uuid | FK to stores |
| status | enum (active, inactive) | Relation status |
| source | enum (first_activity, manual, import) | How the relation was created |
| first_activity_at | timestamp | First transaction timestamp |
| last_activity_at | timestamp | Last transaction timestamp |
| created_by_user_id | uuid | FK to users (for manual creation) |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update |

**Unique constraint**: (cpg_id, store_id)

### campaign_store_enrollments

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| campaign_id | uuid | FK to campaigns |
| store_id | uuid | FK to stores |
| status | enum | visible, invited, enrolled, declined, removed, suspended |
| visibility_source | enum | How store was made visible (manual, zone, import, auto_related) |
| enrollment_source | enum | How store was enrolled (cpg_managed, store_opt_in, auto_enroll) |
| invited_by_user_id | uuid | User who invited |
| enrolled_by_user_id | uuid | User who enrolled |
| invited_at | timestamp | Invitation timestamp |
| enrolled_at | timestamp | Enrollment timestamp |
| declined_at | timestamp | Decline timestamp |
| removed_at | timestamp | Removal timestamp |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update |

**Unique constraint**: (campaign_id, store_id)

### campaigns (new columns)

| Column | Type | Description |
|--------|------|-------------|
| store_access_mode | enum | all_related_stores, selected_stores |
| store_enrollment_mode | enum | store_opt_in, cpg_managed, auto_enroll |

## API Endpoints

### Campaign Store Management (for CPG)

#### GET /campaigns/:campaignId/stores
List stores enrolled/visible in a campaign.

#### POST /campaigns/:campaignId/stores/target
Add stores to a campaign (make them visible/invited).

#### POST /campaigns/:campaignId/stores/:storeId/enroll
Update store enrollment status in a campaign.

### Store-Facing (for Store)

#### GET /stores/:storeId/cpgs
List CPGs related to a store.

#### GET /campaigns/stores/:storeId/campaigns
List campaigns visible to a store.

## Transaction Flow

1. Transaction arrives with storeId and items (productIds)
2. System resolves products → brands → CPGs
3. For each unique CPG in the transaction:
   - Create/update cpg_store_relations with source = 'first_activity'
4. For each campaign the user is eligible for:
   - Check if store is participating in the campaign
   - Only evaluate if store is enrolled (or campaign has auto_enroll)
5. Only products from the campaign's CPG are evaluated for accumulation

## Campaign Visibility Logic

A store can see a campaign if ALL of these are true:
1. Campaign status is 'active'
2. Campaign has a cpgId (not null)
3. Store has an active relation with that CPG
4. AND either:
   - Campaign has `store_access_mode = all_related_stores`, OR
   - Store has a row in campaign_store_enrollments with status in [visible, invited, enrolled]

## Campaign Participation Logic

A store participates in (gets evaluated for) a campaign if ALL of these are true:
1. Campaign status is 'active'
2. User is eligible for the campaign (subscribed, open, universal)
3. Store is visible (see above)
4. AND either:
   - Campaign has `store_access_mode = all_related_stores` AND `store_enrollment_mode = auto_enroll`, OR
   - Store has enrollment status = 'enrolled' in campaign_store_enrollments

## Usage Examples

### Example 1: CPG selects stores by zone
```typescript
// CPG admin selects all stores in "Benito Juárez" for campaign
POST /campaigns/:campaignId/stores/target
{
  "storeIds": ["uuid1", "uuid2", ...],
  "status": "visible",
  "source": "zone"
}
```

### Example 2: Store enrolls in campaign
```typescript
// Store operator opts in to a campaign
POST /campaigns/:campaignId/stores/:storeId/enroll
{
  "status": "enrolled"
}
```

### Example 3: Auto-enroll for all related stores
```typescript
// When creating campaign
POST /campaigns
{
  "name": "Promo春节",
  "storeAccessMode": "all_related_stores",
  "storeEnrollmentMode": "auto_enroll"
}
// All stores with active CPG relation will participate automatically
```

## Seed Data

The seed system has been updated to include:
- 52 stores with geolocation data in CDMX/EdoMex
- CPG-store relations are created automatically on first transaction

## Migration Notes

- Existing campaigns default to `store_access_mode = selected_stores` and `storeEnrollmentMode = store_opt_in`
- This means existing campaigns won't automatically expose to stores - they need explicit targeting
- For backward compatibility, consider running a migration to set `store_access_mode = all_related_stores` for campaigns that should be visible to all related stores
