# Translation Management System

Comprehensive documentation for the LENGOLF Booking System's translation management infrastructure, including database-driven translations, admin UI, and workflow management.

## 📋 Overview

The Translation Management System provides a complete solution for managing multi-language content across the LENGOLF platform. Built on a database-driven architecture with an administrative web interface, this system enables efficient translation workflow management for Thai and English content.

### Key Features

- **Database-Driven Architecture**: All translations stored in Supabase PostgreSQL with Row Level Security
- **Administrative Web Interface**: Browser-based UI for managing translations at `/admin/translations`
- **Workflow Management**: Review and approval system for translation quality control
- **Automatic Export**: Local script-based export to JSON files for application consumption
- **Search and Filtering**: Advanced search capabilities across namespaces and content
- **Real-time Updates**: Live editing with immediate feedback and validation

## 🏗️ System Architecture

### Technology Stack

- **Backend**: Supabase PostgreSQL with Row Level Security (RLS)
- **Frontend**: Next.js 14 with TypeScript and React Server Components
- **UI Framework**: Tailwind CSS with Shadcn/UI components
- **Internationalization**: next-intl for runtime translation handling
- **Export**: Local TypeScript scripts for JSON generation

### Database Schema

```sql
-- Translation namespaces (auth, booking, vip, etc.)
CREATE TABLE public.translation_namespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translation keys (welcomeToLengolf, loginPrompt, etc.)
CREATE TABLE public.translation_keys (
  id SERIAL PRIMARY KEY,
  namespace_id UUID REFERENCES translation_namespaces(id),
  key_path TEXT NOT NULL,
  description TEXT,
  context TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(namespace_id, key_path)
);

-- Individual translations (en/th values)
CREATE TABLE public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id INTEGER REFERENCES translation_keys(id),
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  UNIQUE(key_id, locale)
);

-- Translation edit history
CREATE TABLE public.translation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id UUID REFERENCES translations(id),
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)

All tables implement RLS policies for admin-only access:

```sql
-- Example policy for admin access
CREATE POLICY "Admin access to translations" 
ON public.translations
FOR ALL 
USING (auth.jwt() ->> 'email' IN ('admin@lengolf.com', 'dgeiermann@gmail.com'));
```

## 🎯 Core Components

### 1. Admin Web Interface (`/admin/translations`)

**Location**: `app/admin/translations/page.tsx`

A comprehensive React component providing:

- **Translation Listing**: Paginated display of all translation keys and values
- **Search Functionality**: Real-time search across keys and content
- **Namespace Filtering**: Filter by specific namespaces (auth, booking, vip, etc.)
- **Review Status Filtering**: Show all, unreviewed only, or reviewed only
- **Inline Editing**: Modal-based editing for translation values
- **Approval Workflow**: Approve/unapprove translations with one-click

#### Key Features

```typescript
interface Translation {
  id: string;
  keyPath: string;
  namespace: string;
  en: string;
  th: string;
  context?: string;
  lastUpdated: string;
  isApproved: boolean;
  keyId: number;
}
```

#### Workflow States

- **Unreviewed**: New translations or edited content requiring review
- **Reviewed**: Approved translations ready for production use
- **Auto-approval**: Manual edits are automatically approved upon save

### 2. API Endpoints

#### GET `/api/admin/translations`

**Purpose**: Fetch translations with filtering and search capabilities

**Parameters**:
- `namespace` (optional): Filter by specific namespace
- `search` (optional): Search term for keys and values
- `reviewFilter` (optional): 'all', 'unreviewed', 'reviewed'

**Response**:
```typescript
{
  translations: TranslationKey[];
  total: number;
}
```

#### PUT `/api/admin/translations`

**Purpose**: Update translation values

**Body**:
```typescript
{
  keyId: number;
  locale: 'en' | 'th';
  value: string;
  reason?: string;
}
```

**Behavior**: Automatically approves edited translations

#### POST `/api/admin/translations/approve`

**Purpose**: Mark translations as reviewed/approved

**Body**:
```typescript
{
  keyId: number;
  locale: 'en' | 'th';
}
```

#### POST `/api/admin/translations/unapprove`

**Purpose**: Mark translations as needing review

**Body**:
```typescript
{
  keyId: number;
  locale: 'en' | 'th';
}
```

### 3. Export System

#### Export Script (`scripts/export-translations-simple.js`)

**Purpose**: Generate JSON files for application consumption

**Command**: `npx tsx scripts/export-translations-simple.js`

**Output**: Updates `messages/en.json` and `messages/th.json`

**Features**:
- Exports ALL translations regardless of approval status
- Maintains nested JSON structure (namespace.key format)
- Preserves existing file structure and formatting
- Provides console feedback on export progress

#### Import Script (`scripts/import-translations.ts`)

**Purpose**: Import existing JSON translations into database

**Command**: `npx tsx scripts/import-translations.ts`

**Behavior**:
- Imports all translations from JSON files
- Marks imported translations as **unreviewed** (`is_approved: false`)
- Creates translation keys and namespaces as needed
- Handles nested object structures automatically

## 🔄 Translation Workflow

### Standard Workflow

1. **Content Creation**: Developers add new translation keys to JSON files
2. **Database Import**: Run import script to load translations into database
3. **Review Process**: Use admin UI to review and approve translations
4. **Content Editing**: Make changes through admin interface (auto-approved)
5. **Export**: Export approved translations back to JSON files
6. **Deployment**: Deploy updated JSON files with application

### Review Workflow

1. **Automatic States**:
   - New imports: `is_approved: false` (needs review)
   - Manual edits: `is_approved: true` (auto-approved)

2. **Manual Review**:
   - Use "Unreviewed Only" filter to see pending translations
   - Review content for accuracy and appropriateness
   - Click "Approve" or "Needs Review" buttons as appropriate

3. **Quality Control**:
   - Translation history tracks all changes
   - Change reasons can be provided for audit trail
   - Rollback capabilities through database history

## 🛠️ Usage Guide

### For Developers

#### Adding New Translations

1. Add keys to JSON files:
```json
// messages/en.json
{
  "booking": {
    "newFeature": "New booking feature"
  }
}

// messages/th.json
{
  "booking": {
    "newFeature": "คุณสมบัติการจองใหม่"
  }
}
```

2. Import to database:
```bash
npx tsx scripts/import-translations.ts
```

3. Review via admin UI at `/admin/translations`

4. Export for deployment:
```bash
npx tsx scripts/export-translations-simple.js
```

#### Updating Existing Translations

1. Navigate to `/admin/translations`
2. Search for the translation key
3. Click "Edit" button
4. Modify values and save (auto-approved)
5. Export when ready for deployment

### For Content Managers

#### Review Workflow

1. Access admin interface: `/admin/translations`
2. Set filter to "Unreviewed Only"
3. Review each translation for:
   - Accuracy of translation
   - Proper grammar and spelling
   - Cultural appropriateness
   - Technical terminology consistency
4. Click "Approve" for correct translations
5. Click "Edit" to make corrections (auto-approved)
6. Use "Needs Review" to mark for re-review

#### Search and Organization

- **Namespace Filtering**: Focus on specific areas (auth, booking, vip)
- **Text Search**: Search across keys and translation values
- **Review Status**: Filter by approval status for workflow management

## 🔧 Configuration

### Environment Variables

```bash
# Required for admin operations
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Authentication (currently disabled for feature branch)
NEXTAUTH_SECRET=your_auth_secret
NEXTAUTH_URL=your_app_url
```

### Authentication

**Current Status**: Authentication is temporarily disabled for feature branch development

**Future Implementation**: Will require admin email verification before production deployment

```typescript
// Future authentication check
const allowedEmails = ['admin@lengolf.com', 'dgeiermann@gmail.com'];
const userEmail = session?.user?.email;
const hasAccess = allowedEmails.includes(userEmail);
```

### Namespaces

Current supported namespaces:
- `auth`: Authentication and login related
- `booking`: Booking flow and bay management
- `vip`: VIP portal and customer features
- `common`: Shared UI elements and actions
- `navigation`: Menu and navigation items
- `footer`: Footer content and links

## 📊 Performance Considerations

### Database Optimization

- **Indexes**: Composite indexes on frequently queried columns
- **RLS Policies**: Efficient policies using JWT claims
- **Query Optimization**: Service role key for admin operations

### Caching Strategy

- **Client-side**: React state management for admin UI
- **Export Process**: Full export regeneration (no incremental updates)
- **Application Runtime**: next-intl handles caching of JSON files

### Scalability

- **Service Role Access**: Bypasses RLS for admin operations
- **Batch Operations**: Efficient bulk updates for large translation sets
- **History Tracking**: Separate table for change history

## 🔒 Security Implementation

### Access Control

- **Admin Only**: All translation management restricted to admin users
- **Service Role**: Database operations use service role key
- **RLS Policies**: Row-level security on all tables
- **Audit Trail**: Complete history of all changes

### Data Protection

- **Input Validation**: Sanitization of all user inputs
- **SQL Injection Prevention**: Parameterized queries only
- **XSS Protection**: Proper escaping of output
- **CSRF Protection**: Built-in Next.js protections

## 🐛 Troubleshooting

### Common Issues

#### Import Script Errors

**Issue**: "Permission denied" or "RLS policy violation"
**Solution**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is correctly set

**Issue**: "Duplicate key constraint violation"
**Solution**: Script handles upserts automatically; check for data corruption

#### Admin UI Issues

**Issue**: "Failed to fetch translations"
**Solution**: Verify API endpoints are accessible and service role key is valid

**Issue**: "Save operation fails"
**Solution**: Check network connectivity and database permissions

#### Export Script Problems

**Issue**: "No translations found"
**Solution**: Verify translations exist in database and are active

**Issue**: "File write permissions"
**Solution**: Ensure write access to `messages/` directory

### Development Tips

1. **Local Testing**: Use development Supabase instance for testing
2. **Backup Strategy**: Export translations before major changes
3. **Version Control**: Commit JSON files separately from database changes
4. **Monitoring**: Check Supabase logs for detailed error information

## 📈 Future Enhancements

### Planned Features

- **Bulk Operations**: Mass approve/edit capabilities
- **Translation Memory**: Suggest translations based on similar content
- **Workflow Integration**: GitHub Actions for automated export/import
- **Content Validation**: Automated checks for translation completeness
- **Analytics**: Usage tracking and translation effectiveness metrics

### Technical Improvements

- **Real-time Updates**: WebSocket support for collaborative editing
- **Version Management**: Branching support for different releases
- **API Optimization**: GraphQL implementation for complex queries
- **Mobile Admin**: Responsive admin interface optimization

## 📚 Related Documentation

- **[Internationalization Plan](../technical/INTERNATIONALIZATION_PLAN.md)**: Original requirements and planning
- **[API Reference](../api/API_REFERENCE.md)**: Complete API documentation
- **[Database Schema](../technical/DATABASE_SCHEMA.md)**: Full database structure
- **[Frontend Components](../frontend/COMPONENT_ARCHITECTURE.md)**: UI component documentation
- **[Security Implementation](../technical/SECURITY.md)**: Security guidelines and practices

---

*Last Updated: January 2025*  
*Documentation Version: 1.0*  
*System Status: Production Ready*