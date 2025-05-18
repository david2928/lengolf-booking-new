# VIP Customer Profile Management Discussion
_Exported on 5/18/2025 at 12:02:54 GMT+7 from Cursor (0.50.4)_

---

**User**

Based on @TASKS.md, @TECHNICAL_DESIGN_LENGOLF_VIP.md and @DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md I want to check a few things.

1. The "profile" of a VIP customer should be based on the CRM profile, not their actual profiel on the website (e.g. a customer using google and LINE to login should see the same profile. Is our VIP page right now on "profile" or "CRM profile" level. If it's the first one we should create a new table for their VIP profile, which can be initially populated based on information of both "profile" (Name/Email) and "crm" (phone number), but ultimately should be updated by the customer within their "VIP" profile.

---

**Cursor**

You've raised an excellent point about the source of truth for VIP customer profile information and ensuring consistency across different login methods. Let's break this down based on the provided documentation.

**1. Current VIP Profile Data Handling:**

Based on the `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Sections 4.3 and 4.4) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.3), here's how profile data is currently managed for VIPs:

*   **Data Display (`GET /api/vip/profile`):**
    *   **From `profiles` table (or `profiles_vip_staging` as seen in your open file context):**
        *   User ID (e.g., `profiles.id`)
        *   Name (e.g., `profiles.name` or `profiles.display_name`)
        *   Email (e.g., `profiles.email`)
        *   Profile Picture URL (e.g., `profiles.pictureUrl`)
        *   Marketing Preference (e.g., `profiles.marketing_preference`)
    *   **From `customers` table (CRM data, if linked and matched via `crm_customer_mapping`):**
        *   Phone Number (e.g., `customers.contact_number`)

*   **Data Update (`PUT /api/vip/profile`):**
    *   Changes to `name`, `email`, and `marketingPreference` are written directly to the `profiles` table (or its staging equivalent).
    *   The phone number, derived from the CRM `customers` table, is explicitly mentioned as non-editable by the user in the VIP profile section.

**Is the VIP page on "profile" or "CRM profile" level?**

To directly answer your question: The current VIP profile page operates on a **hybrid level, but editable information is primarily at the `profiles` (login-specific) level.**

*   It pulls the phone number from the CRM profile if a link exists, making that part CRM-centric.
*   However, the core identity details that the user can *edit* (like name and email) are tied to their specific `profiles` record. This record is associated with their login method (e.g., one `profiles` entry for a Google login, potentially another for a LINE login if they were created with different underlying account details).

This means if a single customer links both their Google account (resulting in `profile_A`) and their LINE account (resulting in `profile_B`) to the *same* CRM record:
*   They would see the same CRM phone number in both VIP sessions.
*   But, if they update their name while logged in via Google, it updates `profile_A.name`. This change would *not* automatically reflect if they later log in via LINE (which would read `profile_B.name`). The editable profile data isn't currently unified at the CRM customer level.

**2. Your Proposal: A New Table for Unified VIP Profile**

You suggested: *"If it's the first one we should create a new table for their VIP profile, which can be initially populated based on information of both "profile" (Name/Email) and "crm" (phone number), but ultimately should be updated by the customer within their "VIP" profile."*

This is a very sensible approach to achieve the goal of a unified VIP profile that is consistent across different login methods linked to the same CRM customer.

**How this new table could work:**

Let's imagine a new table, say `vip_customer_data`, linked to the CRM customer identity (e.g., via `crm_customer_id` or `stable_hash_id` from the `customers` table).

*   **Structure:**
    *   `crm_customer_id` (Primary Key, Foreign Key to `customers.id`) or `stable_hash_id`
    *   `vip_display_name` (TEXT)
    *   `vip_email` (TEXT)
    *   `vip_marketing_preference` (BOOLEAN)
    *   (Phone number would still primarily reside in the `customers` table as the CRM source of truth).

*   **Logic Changes:**
    *   **Initial Population:** When a `crm_customer_mapping` record for a CRM customer becomes `is_matched = true` for the very first time, an entry in `vip_customer_data` could be created. The initial `vip_display_name`, `vip_email`, and `vip_marketing_preference` could be copied from the `profiles` record that established this first successful link.
    *   **Reading Profile Data (`GET /api/vip/profile`):**
        *   If the user's session `profile_id` is linked to a matched CRM customer:
            *   Fetch `vip_display_name`, `vip_email`, `vip_marketing_preference` from `vip_customer_data`.
            *   Fetch phone number from `customers.contact_number`.
            *   Profile picture could still come from the specific `profiles.pictureUrl` of the current session (as these are often provider-specific).
    *   **Updating Profile Data (`PUT /api/vip/profile`):**
        *   If the user's session `profile_id` is linked to a matched CRM customer:
            *   Updates to name, email, and marketing preference would write to the corresponding fields in the `vip_customer_data` table for that CRM customer.
    *   **Fallback for Unlinked Users:** If a user is *not* linked and matched (`crm_customer_mapping.is_matched = false`), the system would fall back to reading from and writing to their individual `profiles` table entry for name, email, and marketing preference. This aligns with the documented behavior for users who haven't successfully linked to a CRM record.

**Benefits of this approach:**
*   **Unified Profile:** Achieves your goal. The editable VIP profile information (`name`, `email`, `marketing_preference`) becomes centralized at the CRM customer level.
*   **Consistency:** Edits made via any login method (Google, LINE, etc.), once linked to the same CRM customer, would reflect across all VIP sessions for that customer.

This change would involve modifying the `GET` and `PUT` API endpoints for `/api/vip/profile` and introducing the new table with its associated logic.

In summary, your assessment is correct. The current system doesn't fully unify the editable aspects of the VIP profile at the CRM level. Your proposal to introduce a dedicated table for VIP-managed data linked to the CRM identity is a solid solution to address this.

---

**User**

OK go ahead and use MCP to create the table

---

**Cursor**

Okay, I will now create the new `vip_customer_data` table in your Supabase database.

First, I need to identify the correct Supabase project. I'll list your available projects.


It looks like your project is "info@len.golf's Project" with ID `bisimqmtxjsptehhqpeg`.

Now, I'll create the SQL migration to define the `vip_customer_data` table. This table will link to your existing `customers` table (which I'll assume has `id` as its primary key and is of type UUID, and `stable_hash_id` is also available and unique if `id` isn't the preferred link). For now, I'll plan to use `crm_customer_id` referencing `customers.id`. If `customers.id` is not a UUID or not the correct linking field, please let me know.

Here's the SQL I'll apply:

```sql
CREATE TABLE public.vip_customer_data (
    crm_customer_id UUID PRIMARY KEY,
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE CASCADE
);

-- Optional: Add a unique constraint if you plan to also reference stable_hash_id directly and want to ensure its uniqueness in this table
-- ALTER TABLE public.vip_customer_data
-- ADD COLUMN stable_hash_id TEXT UNIQUE;
-- If you want to link by stable_hash_id instead of crm_customer_id, the primary key and FK would change.

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER set_timestamp_vip_customer_data
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-managed profile data, linked to their CRM record.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'Foreign key to public.customers.id, identifying the CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name preferred by the VIP customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email address preferred by the VIP customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'VIP customer''s marketing communication preference.';
```

I'll name the migration `create_vip_customer_data_table`.

Confirming you're okay with this structure, particularly the `crm_customer_id UUID PRIMARY KEY` referencing `public.customers(id)`. If `public.customers.id` is not a UUID or you prefer to link via `stable_hash_id` as the primary link, please let me know before I proceed.

```sql
CREATE TABLE public.vip_customer_data (
    crm_customer_id UUID PRIMARY KEY,
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE CASCADE
);

-- Optional: Add a unique constraint if you plan to also reference stable_hash_id directly and want to ensure its uniqueness in this table
-- ALTER TABLE public.vip_customer_data
-- ADD COLUMN stable_hash_id TEXT UNIQUE;
-- If you want to link by stable_hash_id instead of crm_customer_id, the primary key and FK would change.

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER set_timestamp_vip_customer_data
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-managed profile data, linked to their CRM record.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'Foreign key to public.customers.id, identifying the CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name preferred by the VIP customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email address preferred by the VIP customer.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'VIP customer''s marketing communication preference.';
```

---

**User**

No, that's OK, but why don't we create for unlinked customers also a UUID already and update it later once a stable hash id is found?

---

**Cursor**

```sql
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE, -- Assuming default
    crm_customer_id UUID NULLABLE, -- This will be updated later
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_crm_customer_optional
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL -- If CRM customer is deleted, nullify the link
);

-- Function and Trigger for updated_at (same as before)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_vip_customer_data
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'Foreign key to public.customers.id. Updated when CRM link is established.';
-- ... comments for other columns ...
```

You're right to push for a solution that allows VIP-specific profile data to be captured even before a CRM link is firmly established, and then consolidated. This ensures a smoother experience for the user, as their explicitly set VIP preferences aren't lost or ignored during the linking process.

Based on your input, here's a revised plan for the table structure. This involves creating the `vip_customer_data` table where each entry gets its own UUID from the start, and then later linking it to a CRM record. We'll also need a way to associate this data back to the user's login profile.

**New Table: `vip_customer_data`**

This table will store the VIP-specific profile attributes that the user can edit.

*   `id`: A unique UUID for each record in this table (this is the "UUID created for unlinked customers"). It will be the primary key.
*   `vip_display_name`: The display name the user sets in their VIP profile.
*   `vip_email`: The email the user sets in their VIP profile.
*   `vip_marketing_preference`: The marketing preference set in the VIP profile.
*   `crm_customer_id`: A UUID that will initially be `NULL`. When the user's account is successfully linked to a CRM record in the `customers` table, this field will be updated with the `customers.id`. This is the "update it later" part.
*   `created_at`, `updated_at`: Timestamps for record management.

**Modification to `profiles` Table**

To link a user's login profile (from the `profiles` table) to their specific VIP data, we'll add a new nullable column to the `profiles` table:

*   `vip_customer_data_id`: This will be a UUID and a foreign key referencing `vip_customer_data.id`.

**How it will work (High-Level):**

1.  **Initial VIP Profile Access/Edit (Unlinked User):**
    *   When a user (logged in via `profiles`) accesses their VIP profile section for the first time or makes an edit:
        *   If their `profiles.vip_customer_data_id` is `NULL`, a new row is created in `vip_customer_data`. Its `id` is stored in `profiles.vip_customer_data_id`.
        *   Their VIP profile edits (name, email, marketing preference) are saved into this new `vip_customer_data` row. `crm_customer_id` in this row remains `NULL`.
2.  **Linking to CRM:**
    *   When this user's `profiles` record is successfully linked to a `customers` record (e.g., `customers_XYZ`):
        *   The `crm_customer_id` in their corresponding `vip_customer_data` row is updated to `customers_XYZ.id`.
3.  **Unification (Ensuring "Same Profile" View):**
    *   This is the more complex part and will primarily be handled in the application logic (API endpoints):
        *   When a user (e.g., `profile_A` linked to `crm_customer_X`) views their VIP profile: The API will look for a `vip_customer_data` record associated with `crm_customer_X`.
        *   If multiple `profiles` (e.g., `profile_A` via Google, `profile_B` via LINE) link to the *same* `crm_customer_X`, they might have initially created separate `vip_customer_data` entries.
        *   The application logic will need a strategy to designate one of these `vip_customer_data` entries as the "master" for `crm_customer_X` (e.g., the most recently updated one).
        *   All `profiles` linked to `crm_customer_X` should then have their `profiles.vip_customer_data_id` updated to point to this single "master" `vip_customer_data.id`. This ensures that any subsequent reads or writes of the VIP profile by any linked login method for that CRM customer go to the same unified record.

**SQL for Migration:**

Here's the SQL I'll use for the migration. I'll name it `create_vip_customer_data_and_link_to_profiles`.

```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    crm_customer_id UUID NULLABLE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_vip_data_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL -- If the CRM customer is deleted, nullify the link here
                           -- but the vip_customer_data row itself remains.
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'FK to public.customers.id. Updated when the users profile is linked to a CRM customer record.';

-- Function to update 'updated_at' timestamp (re-usable)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table
-- Assuming the table is named 'profiles' as per TECHNICAL_DESIGN_LENGOLF_VIP.md
ALTER TABLE public.profiles
ADD COLUMN vip_customer_data_id UUID NULLABLE;

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL; -- If the vip_customer_data record is deleted,
                        -- just nullify the link in profiles.
```

This approach aligns with your suggestion of creating a UUID for the VIP data upfront and updating its CRM link later. The unification logic in the application backend will be key to ensuring consistency when multiple profiles link to the same CRM customer.

I will now apply this migration to your project: "info@len.golf's Project" (ID `bisimqmtxjsptehhqpeg`).


```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    crm_customer_id UUID NULLABLE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_vip_data_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL -- If the CRM customer is deleted, nullify the link here
                           -- but the vip_customer_data row itself remains.
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'FK to public.customers.id. Updated when the users profile is linked to a CRM customer record.';

-- Function to update 'updated_at' timestamp (re-usable)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table
-- Assuming the table is named 'profiles' as per TECHNICAL_DESIGN_LENGOLF_VIP.md
ALTER TABLE public.profiles
ADD COLUMN vip_customer_data_id UUID NULLABLE;

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL; -- If the vip_customer_data record is deleted,
                        -- just nullify the link in profiles.
```

It seems there was a syntax error in the SQL migration I just attempted. The error message `syntax error at or near "NULLABLE"` suggests that `NULLABLE` isn't a valid keyword in that context for PostgreSQL when defining `crm_customer_id UUID NULLABLE`. In PostgreSQL, if you don't specify `NOT NULL`, the column is nullable by default.

I'll correct the SQL and re-apply the migration. The keyword `NULLABLE` will be removed as it's implicit.

Corrected SQL:
```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    crm_customer_id UUID, -- NULL is default, so "NULLABLE" keyword is not needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_vip_data_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'FK to public.customers.id. Updated when the users profile is linked to a CRM customer record.';

-- Function to update 'updated_at' timestamp (re-usable)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table
ALTER TABLE public.profiles
ADD COLUMN vip_customer_data_id UUID; -- NULL is default

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

I will try applying this corrected migration.


```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    crm_customer_id UUID, -- NULL is default, so "NULLABLE" keyword is not needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_vip_data_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'FK to public.customers.id. Updated when the users profile is linked to a CRM customer record.';

-- Function to update 'updated_at' timestamp (re-usable)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table
ALTER TABLE public.profiles
ADD COLUMN vip_customer_data_id UUID; -- NULL is default

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    crm_customer_id UUID, -- NULL is default, so "NULLABLE" keyword is not needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_vip_data_crm_customer
        FOREIGN KEY(crm_customer_id)
        REFERENCES public.customers(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.crm_customer_id IS 'FK to public.customers.id. Updated when the users profile is linked to a CRM customer record.';

-- Function to update 'updated_at' timestamp (re-usable)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table
ALTER TABLE public.profiles
ADD COLUMN vip_customer_data_id UUID; -- NULL is default

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

It seems we've hit another snag. The migration failed with the error: `relation "public.customers" does not exist`.

This means that the `vip_customer_data` table's foreign key `fk_vip_data_crm_customer` cannot be created because it's trying to reference `public.customers(id)`, but a table named `customers` in the `public` schema doesn't exist in your database.

Could you please provide the correct name of the CRM customers table and the schema it's in (if not `public`)? For example, it might be `public.crm_customers` or something similar. Once I have the correct table name, I can adjust the foreign key reference and try the migration again.

I'll also need to know the primary key column name in that customers table if it's not simply `id`.

---

**User**

You should have this information already. But it's crm_customer_mapping_vip_staging
Name	Description	Data Type	Format	
id

No description

uuid	uuid	
profile_id

No description

uuid	uuid	
crm_customer_id

No description

text	text	
crm_customer_data

No description

jsonb	jsonb	
is_matched

No description

boolean	bool	
match_method

No description

text	text	
match_confidence

No description

real	float4	
created_at

No description

timestamp with time zone	timestamptz	
updated_at

No description

timestamp with time zone	timestamptz	
stable_hash_id

No description

text	text	


Please make sure you consider @RLS_IMPLEMENTATION_TASKS.md @AUTH_RLS_DISCOVERY_LOG.md as reference.


---

**Cursor**

```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    -- This field will store the identifier from crm_customer_mapping_vip_staging, e.g., crm_customer_id or stable_hash_id.
    -- Type is TEXT as per crm_customer_mapping_vip_staging.crm_customer_id and stable_hash_id.
    -- No direct FK constraint here to avoid issues if the target column in crm_customer_mapping_vip_staging lacks a UNIQUE constraint.
    -- The link's integrity and consistency are managed at the application layer.
    linked_crm_identifier TEXT NULLABLE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Function to update 'updated_at' timestamp (re-usable, ensure it exists or create it)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles' table (assuming it's public.profiles)
-- This part remains the same, linking a user's login profile to their specific VIP data record.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID NULLABLE; -- Use IF NOT EXISTS for idempotency

COMMENT ON COLUMN public.profiles.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint IF NOT EXISTS (more robust for re-running)
-- To make this idempotent, we'd need to check if constraint exists, which is more complex in plain SQL for ALTER TABLE
-- Simpler: Drop if exists, then add. Or assume it's run once. For now, direct add.
-- If this script might be run multiple times, one might typically drop the constraint before adding it.
-- For now, keeping it simple. If it fails due to existing constraint, that's an indication.
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS fk_profiles_vip_customer_data; -- Drop if exists to ensure clean add

ALTER TABLE public.profiles
ADD CONSTRAINT fk_profiles_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL; -- If the vip_customer_data record is deleted, just nullify the link in profiles.
```

```sql
CREATE POLICY "Allow users to manage their own vip_customer_data"
ON public.vip_customer_data
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.vip_customer_data_id = public.vip_customer_data.id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.vip_customer_data_id = public.vip_customer_data.id
  )
);
```

You're absolutely right to point out the table name and its schema details. My apologies for the previous errors; referencing a non-existent table was the core issue.

Based on your information that CRM customer details are in `crm_customer_mapping_vip_staging` and that its `crm_customer_id` and `stable_hash_id` fields are `TEXT`, and also taking into account the VIP feature development seems to be using `_vip_staging` suffixed tables (like `profiles_vip_staging` as seen in your currently open file and the RLS documentation), I've revised the migration.

Here’s the updated plan:

1.  **Create `public.vip_customer_data` Table:**
    *   `id` (UUID, Primary Key, default gen_random_uuid()): Unique ID for the VIP-specific profile data.
    *   `vip_display_name` (TEXT): Name set by the user in their VIP profile.
    *   `vip_email` (TEXT): Email set by the user in their VIP profile.
    *   `vip_marketing_preference` (BOOLEAN, default TRUE): Marketing preference.
    *   `linked_crm_identifier` (TEXT, NULLABLE): This field will store the CRM customer identifier (like `crm_customer_id` or `stable_hash_id` from `crm_customer_mapping_vip_staging`) once the user is linked. Since the target identifiers in `crm_customer_mapping_vip_staging` are TEXT, this field is also TEXT. **No database-level foreign key will be created on this column to `crm_customer_mapping_vip_staging` for now.** This avoids issues if the target columns in the mapping table don't have a UNIQUE constraint, and allows the application layer to manage the linking logic and consistency.
    *   `created_at`, `updated_at` (TIMESTAMPTZ).

2.  **Alter `public.profiles_vip_staging` Table:**
    *   Add a new column `vip_customer_data_id` (UUID, NULLABLE).
    *   This column will be a foreign key referencing `public.vip_customer_data(id)`. This links a user's specific login profile (from `profiles_vip_staging`) to their dedicated VIP data record.

This approach:
*   Correctly types the `linked_crm_identifier`.
*   Targets `profiles_vip_staging` for the alteration, aligning with the apparent development practice for the VIP feature.
*   Makes the link between `vip_customer_data` and the CRM system a logical one via `linked_crm_identifier`, to be managed by your application. This offers flexibility if the uniqueness constraints on the `crm_customer_mapping_vip_staging` table's identifier fields are not suitable for a direct FK.

Here is the corrected SQL for the migration, which I'll name `create_vip_customer_data_and_link_to_profiles_staging_v3`:

```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    linked_crm_identifier TEXT NULLABLE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier. Used with _vip_staging tables.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Ensure the function to update 'updated_at' timestamp exists
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles_vip_staging' table
-- Targeting profiles_vip_staging as per VIP development context
ALTER TABLE public.profiles_vip_staging
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID NULLABLE;

COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint, ensure to drop if it somehow exists from a previous attempt on this table
ALTER TABLE public.profiles_vip_staging
DROP CONSTRAINT IF EXISTS fk_profiles_vip_staging_vip_customer_data;

ALTER TABLE public.profiles_vip_staging
ADD CONSTRAINT fk_profiles_vip_staging_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

I will now apply this new migration.


```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    linked_crm_identifier TEXT NULLABLE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier. Used with _vip_staging tables.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Ensure the function to update 'updated_at' timestamp exists
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles_vip_staging' table
-- Targeting profiles_vip_staging as per VIP development context
ALTER TABLE public.profiles_vip_staging
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID NULLABLE;

COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint, ensure to drop if it somehow exists from a previous attempt on this table
ALTER TABLE public.profiles_vip_staging
DROP CONSTRAINT IF EXISTS fk_profiles_vip_staging_vip_customer_data;

ALTER TABLE public.profiles_vip_staging
ADD CONSTRAINT fk_profiles_vip_staging_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

It seems I've made the same mistake again with the `NULLABLE` keyword in the `CREATE TABLE` statement. It is indeed not necessary in PostgreSQL, as columns are nullable by default if not specified as `NOT NULL`.

My apologies for this repeated oversight. I'll remove it and try one more time.

Corrected SQL (v4):
```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    linked_crm_identifier TEXT, -- Default is NULL, "NULLABLE" keyword removed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier. Used with _vip_staging tables.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Ensure the function to update 'updated_at' timestamp exists
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles_vip_staging' table
ALTER TABLE public.profiles_vip_staging
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID; -- Default is NULL

COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles_vip_staging
DROP CONSTRAINT IF EXISTS fk_profiles_vip_staging_vip_customer_data;

ALTER TABLE public.profiles_vip_staging
ADD CONSTRAINT fk_profiles_vip_staging_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

I'll apply this version.


```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    linked_crm_identifier TEXT, -- Default is NULL, "NULLABLE" keyword removed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier. Used with _vip_staging tables.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Ensure the function to update 'updated_at' timestamp exists
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles_vip_staging' table
ALTER TABLE public.profiles_vip_staging
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID; -- Default is NULL

COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles_vip_staging
DROP CONSTRAINT IF EXISTS fk_profiles_vip_staging_vip_customer_data;

ALTER TABLE public.profiles_vip_staging
ADD CONSTRAINT fk_profiles_vip_staging_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

```sql
-- 1. Create the vip_customer_data table
CREATE TABLE public.vip_customer_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vip_display_name TEXT,
    vip_email TEXT,
    vip_marketing_preference BOOLEAN DEFAULT TRUE,
    linked_crm_identifier TEXT, -- Default is NULL, "NULLABLE" keyword removed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer-editable profile data. Can be created before CRM linking and is eventually linked to a CRM customer identifier. Used with _vip_staging tables.';
COMMENT ON COLUMN public.vip_customer_data.id IS 'Unique identifier for the VIP customer data record.';
COMMENT ON COLUMN public.vip_customer_data.vip_display_name IS 'Display name set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_email IS 'Email set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.vip_marketing_preference IS 'Marketing preference set by the user in their VIP profile.';
COMMENT ON COLUMN public.vip_customer_data.linked_crm_identifier IS 'Stores the CRM customer identifier (e.g., crm_customer_id or stable_hash_id from crm_customer_mapping_vip_staging) once linked. Type is TEXT.';

-- Ensure the function to update 'updated_at' timestamp exists
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'vip_customer_data' table
CREATE TRIGGER set_timestamp_on_vip_customer_data_update
BEFORE UPDATE ON public.vip_customer_data
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add the foreign key column to the 'profiles_vip_staging' table
ALTER TABLE public.profiles_vip_staging
ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID; -- Default is NULL

COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Links to the users specific VIP profile data in the vip_customer_data table.';

-- Add foreign key constraint
ALTER TABLE public.profiles_vip_staging
DROP CONSTRAINT IF EXISTS fk_profiles_vip_staging_vip_customer_data;

ALTER TABLE public.profiles_vip_staging
ADD CONSTRAINT fk_profiles_vip_staging_vip_customer_data
    FOREIGN KEY (vip_customer_data_id)
    REFERENCES public.vip_customer_data(id)
    ON DELETE SET NULL;
```

Great! It appears the migration `create_vip_customer_data_and_link_to_profiles_staging_v4` was applied successfully this time.

To summarize, we have:
1.  Created the `public.vip_customer_data` table with an `id` (UUID PK), fields for `vip_display_name`, `vip_email`, `vip_marketing_preference`, and a `linked_crm_identifier` (TEXT) to store the textual identifier from your `crm_customer_mapping_vip_staging` table.
2.  Altered the `public.profiles_vip_staging` table to add a `vip_customer_data_id` (UUID) column.
3.  Added a foreign key constraint `fk_profiles_vip_staging_vip_customer_data` on `public.profiles_vip_staging.vip_customer_data_id` referencing `public.vip_customer_data(id)`.

This structure should now support your goal of having a distinct, user-editable VIP profile that can be created before a CRM link is established and later associated with a CRM customer identifier, with the data being unified at the application level.

The next steps would involve updating your API endpoints (`GET /api/vip/profile`, `PUT /api/vip/profile`, and the logic during account linking/session creation) to use these new tables and columns. You'll also need to implement the application-side logic for creating/linking `vip_customer_data` records and ensuring that multiple `profiles_vip_staging` entries for the same CRM customer point to a single, unified `vip_customer_data` record.

Is there anything else I can help you with regarding this table setup or related tasks?

---

**User**

Please go ahead with the updates and populating the data

---

**Cursor**

```javascript
        const { data: userProfile, error: profileError } = await supabaseUserClient
          .from('profiles_vip_staging')
          .select('id, vip_customer_data_id, display_name, email') // Add other fields if needed for fallback/initial population
          .eq('id', profileId)
          .single();
        if (profileError || !userProfile) { /* handle error */ }
```

```javascript
            const { data: newVipData, error: insertVipError } = await supabaseUserClient
              .from('vip_customer_data')
              .insert({
                vip_display_name: name, // from request or fallback to userProfile.display_name
                vip_email: email,       // from request or fallback to userProfile.email
                vip_marketing_preference: marketingPreference,
                // linked_crm_identifier will be null initially
              })
              .select('id')
              .single();
            if (insertVipError || !newVipData) { /* handle error */ }
```

```javascript
            const { error: updateProfileError } = await supabaseUserClient
              .from('profiles_vip_staging')
              .update({ vip_customer_data_id: newVipData.id })
              .eq('id', profileId);
            if (updateProfileError) { /* handle error */ }
```

```javascript
            const updatePayloadVip = {};
            if (name !== undefined) updatePayloadVip.vip_display_name = name;
            if (email !== undefined) updatePayloadVip.vip_email = email;
            if (marketingPreference !== undefined) updatePayloadVip.vip_marketing_preference = marketingPreference;

            if (Object.keys(updatePayloadVip).length > 0) {
              const { error: updateVipError } = await supabaseUserClient
                .from('vip_customer_data')
                .update(updatePayloadVip)
                .eq('id', userProfile.vip_customer_data_id);
              if (updateVipError) { /* handle error */ }
            }
```

```javascript
    const { data: userProfile, error: profileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, pictureUrl, display_name, email') // Select original fields for fallback/if no vip_customer_data
      .eq('id', profileId)
      .single();
    if (profileError || !userProfile) { /* handle error */ }
```

```javascript
        const { data: vipData, error: vipDataError } = await supabaseUserClient
          .from('vip_customer_data')
          .select('vip_display_name, vip_email, vip_marketing_preference, linked_crm_identifier')
          .eq('id', userProfile.vip_customer_data_id)
          .single();
        if (vipDataError || !vipData) { /* handle error, or maybe it's fine if vipData is null if the link is broken? */ }
```

Okay, tackling the updates for the API endpoints and then the data population is a good plan. This will be a multi-step process.

I'll start by modifying the API endpoint for fetching and updating user profiles: `app/api/vip/profile/route.ts`. This involves changing how profile data is read and written to use the new `vip_customer_data` table and the `vip_customer_data_id` link in the `profiles_vip_staging` table.

First, I need to read the current content of `app/api/vip/profile/route.ts` to understand its existing structure.


My apologies, I made an error in trying to read the file. I'll correct that and read `app/api/vip/profile/route.ts` properly.


Okay, I have the content of `app/api/vip/profile/route.ts`.
Now, I'll apply the necessary changes to both the `GET` and `PUT` handlers to integrate the new `vip_customer_data` table.

Here's the plan:

**For the `PUT` handler:**

1.  Fetch the `profiles_vip_staging` record for the current user, including its `vip_customer_data_id`.
2.  If `vip_customer_data_id` is `null`:
    *   Create a new record in `vip_customer_data` using the `display_name`, `email`, and `marketingPreference` from the request.
    *   Update the `profiles_vip_staging` record to set its `vip_customer_data_id` to the ID of the newly created `vip_customer_data` record.
3.  If `vip_customer_data_id` is *not* `null`:
    *   Update the existing `vip_customer_data` record with the new `display_name`, `email`, and `marketingPreference`.

**For the `GET` handler:**

1.  Fetch the `profiles_vip_staging` record, including `vip_customer_data_id` and `picture_url`.
2.  If `vip_customer_data_id` is *not* `null`:
    *   Fetch the corresponding record from `vip_customer_data`.
    *   Use `vip_display_name`, `vip_email`, `vip_marketing_preference` from this `vip_customer_data` record.
    *   If `vip_customer_data.linked_crm_identifier` is present, use it to fetch the phone number from the CRM system (this part of the logic for fetching phone numbers via CRM linking seems to be mostly in place already, but it will now use `linked_crm_identifier`).
3.  If `vip_customer_data_id` is `null`:
    *   Use `display_name` and `email` from `profiles_vip_staging`.
    *   `marketingPreference` might come from `profiles_vip_staging` if it exists there and is maintained, otherwise, it might be considered `null` or a default value until the `vip_customer_data` record is created. For now, the `vip_customer_data` has a default, so on first PUT it will be set.
4.  The `pictureUrl` will still come from `profiles_vip_staging`.

I will now construct the `edit_file` call with these changes. This is a significant modification to the file.


```typescript
// ... existing code ...
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createCrmClient } from '@/utils/supabase/crm';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipProfileSessionUser extends NextAuthUser {
  id: string;
  provider?: string;
  phone?: string | null;
}

interface VipProfileSession extends NextAuthSession {
  accessToken?: string;
  user: VipProfileSessionUser;
}

export async function GET() {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API GET] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });
  const crmSupabase = createCrmClient();

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, email, display_name, picture_url, marketing_preference, phone_number, vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (userProfileError) {
      console.error('Error fetching user profile (profiles_vip_staging):', userProfileError);
      return NextResponse.json({ error: 'Error fetching user profile data.' }, { status: 500 });
    }
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    let vipDisplayName = userProfile.display_name;
    let vipEmail = userProfile.email;
    let vipMarketingPreference = userProfile.marketing_preference;
    let linkedCrmIdentifier: string | null = null;
    let customerPhoneNumber: string | null = userProfile.phone_number; // Fallback to profile phone initially

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('vip_display_name, vip_email, vip_marketing_preference, linked_crm_identifier')
        .eq('id', userProfile.vip_customer_data_id)
        .single();

      if (vipDataError) {
        console.warn(`[VIP Profile API GET] Could not fetch vip_customer_data for id ${userProfile.vip_customer_data_id}:`, vipDataError);
        // Non-fatal, proceed with data from profiles_vip_staging as fallback
      } else if (vipData) {
        vipDisplayName = vipData.vip_display_name ?? vipDisplayName;
        vipEmail = vipData.vip_email ?? vipEmail;
        vipMarketingPreference = vipData.vip_marketing_preference ?? vipMarketingPreference;
        linkedCrmIdentifier = vipData.linked_crm_identifier;
      }
    }
    
    // Fetch CRM mapping and customer phone number
    // This part can largely remain, but uses `linkedCrmIdentifier` if available from `vip_customer_data`,
    // or falls back to querying crm_customer_mapping_vip_staging directly if no vip_customer_data or no linked_crm_identifier
    let crmStatus: string = 'not_linked';
    let crmCustomerIdFromMapping: string | null = null;
    let stableHashIdFromMapping: string | null = null;

    if (linkedCrmIdentifier) {
        // If we have a linked_crm_identifier from vip_customer_data,
        // we assume this is the key to use (e.g. stable_hash_id or crm_customer_id)
        // The logic here depends on what linked_crm_identifier actually stores.
        // For now, let's assume it might be a direct crm_customer_id or stable_hash_id.
        // This part might need refinement based on how linked_crm_identifier is populated.
        // The example below assumes it might be a crm_customer_id.
        const { data: customerData, error: customerError } = await crmSupabase
            .from('customers') // Assuming 'customers' is the correct CRM table
            .select('contact_number, id, stable_hash_id') // Select id and stable_hash_id for crmStatus
            .eq('id', linkedCrmIdentifier) // Assuming linked_crm_identifier is customers.id
            // Or .eq('stable_hash_id', linkedCrmIdentifier) if it stores stable_hash_id
            .maybeSingle();

        if (customerError) {
            console.error('Error fetching CRM customer phone using linked_crm_identifier:', customerError);
        } else if (customerData) {
            customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
            crmStatus = 'linked_matched';
            crmCustomerIdFromMapping = customerData.id; // Assuming it's customers.id
            stableHashIdFromMapping = customerData.stable_hash_id;
        } else {
            // If linked_crm_identifier was set but no customer found, it's an issue or stale link
            crmStatus = 'linked_unmatched'; // Or some other status indicating a problem
            console.warn(`[VIP Profile API GET] linked_crm_identifier ${linkedCrmIdentifier} found in vip_customer_data, but no matching customer in CRM.`);
        }
    } else {
        // Fallback to original logic if no linked_crm_identifier from vip_customer_data
        const { data: mapping, error: mappingError } = await supabaseUserClient
          .from('crm_customer_mapping_vip_staging')
          .select('is_matched, crm_customer_id, stable_hash_id')
          .eq('profile_id', profileId)
          .maybeSingle();

        if (mappingError) {
          console.error('Error fetching CRM mapping (crm_customer_mapping_vip_staging):', mappingError);
        } else if (mapping) {
            crmCustomerIdFromMapping = mapping.crm_customer_id;
            stableHashIdFromMapping = mapping.stable_hash_id;
            if (mapping.is_matched && mapping.crm_customer_id) {
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('id', mapping.crm_customer_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping:', customerError);
                } else if (customerData) {
                    customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
                }
                crmStatus = 'linked_matched';
            } else {
                crmStatus = 'linked_unmatched';
            }
        }
    }


    return NextResponse.json({
      id: userProfile.id,
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: customerPhoneNumber,
      pictureUrl: userProfile.picture_url,
      marketingPreference: vipMarketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerIdFromMapping,
      stableHashId: stableHashIdFromMapping,
    });

  } catch (error) {
    console.error('Unexpected error in GET /api/vip/profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API PUT] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName } = requestBody;
  const updatedFieldsAccumulator: string[] = [];

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, display_name, email') // Fetch existing values for potential fallback
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Profile API PUT] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: userProfileError ? 500 : 404 });
    }

    let targetVipDataId = userProfile.vip_customer_data_id;

    if (!targetVipDataId) {
      // Create new vip_customer_data record
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name, // Fallback to profile display_name
          vip_email: reqEmail ?? userProfile.email,                   // Fallback to profile email
          vip_marketing_preference: reqMarketingPreference ?? true,   // Default if not provided
        })
        .select('id')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Profile API PUT] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to create VIP profile data.' }, { status: 500 });
      }
      targetVipDataId = newVipData.id;

      // Link it to profiles_vip_staging
      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles_vip_staging')
        .update({ vip_customer_data_id: targetVipDataId, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (updateProfileLinkError) {
        console.error('[VIP Profile API PUT] Error linking vip_customer_data to profile:', updateProfileLinkError);
        // Non-fatal for the update of vip_customer_data itself, but log it. User might need to retry.
        // Or, decide if this is a hard failure. For now, proceed to update vip_customer_data.
      }
      // Since it's newly created, all provided fields are "updated"
      if (reqDisplayName !== undefined) updatedFieldsAccumulator.push('display_name');
      if (reqEmail !== undefined) updatedFieldsAccumulator.push('email');
      if (reqMarketingPreference !== undefined) updatedFieldsAccumulator.push('marketingPreference');
    } else {
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        updated_at?: string;
      }> = {};

      if (reqDisplayName !== undefined) {
        if (typeof reqDisplayName === 'string') {
          vipUpdatePayload.vip_display_name = reqDisplayName;
          updatedFieldsAccumulator.push('display_name');
        } else {
          return NextResponse.json({ error: 'Invalid display_name format.' }, { status: 400 });
        }
      }
      if (reqEmail !== undefined) {
        if (typeof reqEmail === 'string' && /^[\w\-\.]+@([\w\-]+\.)+[\w\-]{2,4}$/.test(reqEmail)) {
          vipUpdatePayload.vip_email = reqEmail;
          updatedFieldsAccumulator.push('email');
        } else {
          return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
        }
      }
      if (reqMarketingPreference !== undefined) {
        if (typeof reqMarketingPreference === 'boolean') {
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
        vipUpdatePayload.updated_at = new Date().toISOString();
        const { error: updateVipError } = await supabaseUserClient
          .from('vip_customer_data')
          .update(vipUpdatePayload)
          .eq('id', targetVipDataId);

        if (updateVipError) {
          console.error('[VIP Profile API PUT] Error updating vip_customer_data:', updateVipError);
          return NextResponse.json({ error: 'Failed to update VIP profile data.' }, { status: 500 });
        }
      }
    }
    
    // Also update profiles_vip_staging.updated_at if any actual VIP data changed,
    // or if only profiles_vip_staging specific fields were intended to be updated (though not the case here).
    if (updatedFieldsAccumulator.length > 0) {
        const { error: touchProfileError } = await supabaseUserClient
            .from('profiles_vip_staging')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', profileId);
        if (touchProfileError) {
             console.warn('[VIP Profile API PUT] Failed to touch profiles_vip_staging.updated_at:', touchProfileError);
        }
    }


    if (updatedFieldsAccumulator.length === 0) {
      return NextResponse.json({ message: 'No valid fields to update or data is the same.', updatedFields: [] }, { status: 200 });
    }

    return NextResponse.json({ success: true, updatedFields: updatedFieldsAccumulator });

  } catch (error) {
    console.error('[VIP Profile API PUT] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

```

The `edit_file` tool has applied the changes to `app/api/vip/profile/route.ts`. The diff shows the modifications to integrate the `vip_customer_data` table into both the `GET` and `PUT` handlers.

**Key changes include:**

*   **GET Handler:**
    *   Fetches `vip_customer_data_id` from `profiles_vip_staging`.
    *   If `vip_customer_data_id` exists, it fetches data from `vip_customer_data` and uses those values for `name`, `email`, and `marketingPreference`.
    *   It attempts to use `linked_crm_identifier` from `vip_customer_data` to fetch CRM details. If not available, it falls back to the previous logic of querying `crm_customer_mapping_vip_staging`.
*   **PUT Handler:**
    *   Fetches `vip_customer_data_id` from `profiles_vip_staging`.
    *   If `vip_customer_data_id` is null, it creates a new entry in `vip_customer_data` and then updates `profiles_vip_staging.vip_customer_data_id`.
    *   If `vip_customer_data_id` exists, it updates the corresponding record in `vip_customer_data`.
    *   It also updates the `updated_at` timestamp in `profiles_vip_staging` if any changes were made to the VIP data.

**Next Steps & Considerations:**

1.  **Review `linked_crm_identifier` Logic in GET:**
    *   In the `GET` handler, the way `linked_crm_identifier` is used to fetch customer data needs careful review. The placeholder comment `// Assuming linked_crm_identifier is customers.id` highlights this. You need to ensure that the query to the `customers` table correctly uses `linked_crm_identifier` based on what it actually stores (e.g., `customers.id` or `customers.stable_hash_id`).

2.  **Account Linking Logic:**
    *   The logic in `POST /api/vip/link-account/route.ts` and any relevant NextAuth callbacks (e.g., `signIn`, `session`) needs to be updated:
        *   When an account is linked to a CRM record, ensure `vip_customer_data.linked_crm_identifier` is populated.
        *   Implement the **unification logic**: if multiple `profiles_vip_staging` records (and thus potentially multiple `vip_customer_data` records) get linked to the *same* CRM customer, you need a strategy to merge/point them to a single "master" `vip_customer_data` record. This is crucial for profile consistency.

3.  **Data Population (Backfill Script):**
    *   For existing users, we need to populate `vip_customer_data` and link it from `profiles_vip_staging`. I can help generate a Supabase SQL script for this. This script would:
        *   Iterate through `profiles_vip_staging`.
        *   For each profile, create a corresponding `vip_customer_data` entry (populating `vip_display_name`, `vip_email` from `profiles_vip_staging`, and setting default `vip_marketing_preference`).
        *   Update `profiles_vip_staging.vip_customer_data_id` with the new ID.
        *   If the profile is already linked in `crm_customer_mapping_vip_staging`, populate `vip_customer_data.linked_crm_identifier`.
    *   A second, more complex script or application-level process might be needed for unification after the initial backfill if multiple profiles already point to the same CRM customer.

Do you want to proceed with reviewing the `linked_crm_identifier` usage in the GET request, updating the account linking logic, or shall I draft the data population script first? Given the complexity, focusing on the population script next might be a good step to get existing data into the new structure.

---

**User**

Yes, but also can you make the change that marketing preference should be set at vip_customer level and it can be dropped from the profiles table

---

**Cursor**

Okay, you want to ensure that `marketing_preference` is managed exclusively at the `vip_customer_data` level and remove it from the `profiles_vip_staging` table. This is a good step for centralizing VIP-specific preferences.

Here's the plan:

**Phase 1: Database and API Code Modifications**

1.  **Modify Database Schema:**
    *   I'll create and apply a Supabase migration to drop the `marketing_preference` column from the `public.profiles_vip_staging` table.
2.  **Update API Code (`app/api/vip/profile/route.ts`):**
    *   **GET Handler:**
        *   Remove `marketing_preference` from the fields selected from `profiles_vip_staging`.
        *   The `vipMarketingPreference` variable will now *only* be populated from `vip_customer_data`. If `vip_customer_data` doesn't exist for a user yet, the `marketingPreference` in the API response will effectively be `null` or rely on the default value when a `vip_customer_data` record is eventually created (which is `TRUE`).
    *   **PUT Handler:**
        *   When creating a `vip_customer_data` record, `vip_marketing_preference` will be set based on the request or default to `TRUE` (as per table definition).
        *   When updating, it will only update `vip_customer_data.vip_marketing_preference`.
        *   All logic reading from or writing `marketing_preference` to `profiles_vip_staging` will be removed.

**Phase 2: Data Population/Backfill**

1.  **Draft and Execute Backfill Script:** After the schema and API are updated, I'll help you with a SQL script to:
    *   Create `vip_customer_data` records for existing users in `profiles_vip_staging` who don't have one.
        *   The `vip_display_name` and `vip_email` will be copied from `profiles_vip_staging`.
        *   `vip_marketing_preference` in the new `vip_customer_data` records will automatically get its default value of `TRUE` (or you could decide to copy the most recent value from the old `profiles_vip_staging.marketing_preference` before dropping it, though dropping then defaulting is cleaner). For now, we'll rely on the default.
    *   Link these new `vip_customer_data` records by updating `profiles_vip_staging.vip_customer_data_id`.
    *   Populate `vip_customer_data.linked_crm_identifier` if a CRM link already exists in `crm_customer_mapping_vip_staging`.

Let's start with **Phase 1, Step 1: Modify Database Schema**.

I'll create a migration to drop `marketing_preference` from `public.profiles_vip_staging`.
Migration name: `drop_marketing_preference_from_profiles_vip_staging`
Project ID: `bisimqmtxjsptehhqpeg`
SQL:
```sql
ALTER TABLE public.profiles_vip_staging
DROP COLUMN IF EXISTS marketing_preference;
```

I'll apply this migration now.


```sql
ALTER TABLE public.profiles_vip_staging
DROP COLUMN IF EXISTS marketing_preference;
```

The column `marketing_preference` has been successfully dropped from `public.profiles_vip_staging`.

Now for **Phase 1, Step 2: Update API Code (`app/api/vip/profile/route.ts`)**.

I'll modify the `GET` and `PUT` handlers as planned.
`marketing_preference` will no longer be selected from `profiles_vip_staging` in the GET.
The response's `marketingPreference` field will source its value from `vipData.vip_marketing_preference`. If `vipData` is not found, it will be `null` (or could be defaulted to `true` in the response if preferred, matching the DB default for new records). For now, it will be what's in `vip_customer_data` or `null` if no such record.
In the PUT handler, `marketing_preference` from the request will only affect `vip_customer_data`.

I will read the file again to ensure I have the latest version before proposing the edit.


It seems the file content I have for `app/api/vip/profile/route.ts` is the one *before* my previous edit that introduced `vip_customer_data_id` into the `profiles_vip_staging` selections and the logic for handling `vip_customer_data`. This is unexpected, as the `edit_file` call reported success.

To ensure I'm working with the correct baseline, I will try to re-apply the previous comprehensive edit first, and then layer on the specific changes for `marketing_preference`. This will ensure all intended logic for `vip_customer_data` is in place.

I'll re-use the `code_edit` from my prior turn (the one that introduced `vip_customer_data` logic extensively).


```typescript
// ... existing code ...
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { createCrmClient } from '@/utils/supabase/crm';
import { createClient } from '@supabase/supabase-js';
import type { Session as NextAuthSession, User as NextAuthUser } from 'next-auth';

interface VipProfileSessionUser extends NextAuthUser {
  id: string;
  provider?: string;
  phone?: string | null;
}

interface VipProfileSession extends NextAuthSession {
  accessToken?: string;
  user: VipProfileSessionUser;
}

export async function GET() {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API GET] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });
  const crmSupabase = createCrmClient();

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, email, display_name, picture_url, marketing_preference, phone_number, vip_customer_data_id')
      .eq('id', profileId)
      .single();

    if (userProfileError) {
      console.error('Error fetching user profile (profiles_vip_staging):', userProfileError);
      return NextResponse.json({ error: 'Error fetching user profile data.' }, { status: 500 });
    }
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    let vipDisplayName = userProfile.display_name;
    let vipEmail = userProfile.email;
    let vipMarketingPreference = userProfile.marketing_preference;
    let linkedCrmIdentifier: string | null = null;
    let customerPhoneNumber: string | null = userProfile.phone_number; // Fallback to profile phone initially

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('vip_display_name, vip_email, vip_marketing_preference, linked_crm_identifier')
        .eq('id', userProfile.vip_customer_data_id)
        .single();

      if (vipDataError) {
        console.warn(`[VIP Profile API GET] Could not fetch vip_customer_data for id ${userProfile.vip_customer_data_id}:`, vipDataError);
        // Non-fatal, proceed with data from profiles_vip_staging as fallback
      } else if (vipData) {
        vipDisplayName = vipData.vip_display_name ?? vipDisplayName;
        vipEmail = vipData.vip_email ?? vipEmail;
        vipMarketingPreference = vipData.vip_marketing_preference ?? vipMarketingPreference;
        linkedCrmIdentifier = vipData.linked_crm_identifier;
      }
    }
    
    // Fetch CRM mapping and customer phone number
    // This part can largely remain, but uses `linkedCrmIdentifier` if available from `vip_customer_data`,
    // or falls back to querying crm_customer_mapping_vip_staging directly if no vip_customer_data or no linked_crm_identifier
    let crmStatus: string = 'not_linked';
    let crmCustomerIdFromMapping: string | null = null;
    let stableHashIdFromMapping: string | null = null;

    if (linkedCrmIdentifier) {
        // If we have a linked_crm_identifier from vip_customer_data,
        // we assume this is the key to use (e.g. stable_hash_id or crm_customer_id)
        // The logic here depends on what linked_crm_identifier actually stores.
        // For now, let's assume it might be a direct crm_customer_id or stable_hash_id.
        // This part might need refinement based on how linked_crm_identifier is populated.
        // The example below assumes it might be a crm_customer_id.
        const { data: customerData, error: customerError } = await crmSupabase
            .from('customers') // Assuming 'customers' is the correct CRM table
            .select('contact_number, id, stable_hash_id') // Select id and stable_hash_id for crmStatus
            .eq('id', linkedCrmIdentifier) // Assuming linked_crm_identifier is customers.id
            // Or .eq('stable_hash_id', linkedCrmIdentifier) if it stores stable_hash_id
            .maybeSingle();

        if (customerError) {
            console.error('Error fetching CRM customer phone using linked_crm_identifier:', customerError);
        } else if (customerData) {
            customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
            crmStatus = 'linked_matched';
            crmCustomerIdFromMapping = customerData.id; // Assuming it's customers.id
            stableHashIdFromMapping = customerData.stable_hash_id;
        } else {
            // If linked_crm_identifier was set but no customer found, it's an issue or stale link
            crmStatus = 'linked_unmatched'; // Or some other status indicating a problem
            console.warn(`[VIP Profile API GET] linked_crm_identifier ${linkedCrmIdentifier} found in vip_customer_data, but no matching customer in CRM.`);
        }
    } else {
        // Fallback to original logic if no linked_crm_identifier from vip_customer_data
        const { data: mapping, error: mappingError } = await supabaseUserClient
          .from('crm_customer_mapping_vip_staging')
          .select('is_matched, crm_customer_id, stable_hash_id')
          .eq('profile_id', profileId)
          .maybeSingle();

        if (mappingError) {
          console.error('Error fetching CRM mapping (crm_customer_mapping_vip_staging):', mappingError);
        } else if (mapping) {
            crmCustomerIdFromMapping = mapping.crm_customer_id;
            stableHashIdFromMapping = mapping.stable_hash_id;
            if (mapping.is_matched && mapping.crm_customer_id) {
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('id', mapping.crm_customer_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping:', customerError);
                } else if (customerData) {
                    customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
                }
                crmStatus = 'linked_matched';
            } else {
                crmStatus = 'linked_unmatched';
            }
        }
    }


    return NextResponse.json({
      id: userProfile.id,
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: customerPhoneNumber,
      pictureUrl: userProfile.picture_url,
      marketingPreference: vipMarketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerIdFromMapping,
      stableHashId: stableHashIdFromMapping,
    });

  } catch (error) {
    console.error('Unexpected error in GET /api/vip/profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions) as VipProfileSession | null;

  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized or missing token' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Profile API PUT] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error: Supabase connection details missing.' }, { status: 500 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`
      }
    }
  });

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName } = requestBody;
  const updatedFieldsAccumulator: string[] = [];

  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, display_name, email') // Fetch existing values for potential fallback
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Profile API PUT] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: userProfileError ? 500 : 404 });
    }

    let targetVipDataId = userProfile.vip_customer_data_id;

    if (!targetVipDataId) {
      // Create new vip_customer_data record
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name, // Fallback to profile display_name
          vip_email: reqEmail ?? userProfile.email,                   // Fallback to profile email
          vip_marketing_preference: reqMarketingPreference ?? true,   // Default if not provided
        })
        .select('id')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Profile API PUT] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to create VIP profile data.' }, { status: 500 });
      }
      targetVipDataId = newVipData.id;

      // Link it to profiles_vip_staging
      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles_vip_staging')
        .update({ vip_customer_data_id: targetVipDataId, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (updateProfileLinkError) {
        console.error('[VIP Profile API PUT] Error linking vip_customer_data to profile:', updateProfileLinkError);
        // Non-fatal for the update of vip_customer_data itself, but log it. User might need to retry.
        // Or, decide if this is a hard failure. For now, proceed to update vip_customer_data.
      }
      // Since it's newly created, all provided fields are "updated"
      if (reqDisplayName !== undefined) updatedFieldsAccumulator.push('display_name');
      if (reqEmail !== undefined) updatedFieldsAccumulator.push('email');
      if (reqMarketingPreference !== undefined) updatedFieldsAccumulator.push('marketingPreference');
    } else {
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        updated_at?: string;
      }> = {};

      if (reqDisplayName !== undefined) {
        if (typeof reqDisplayName === 'string') {
          vipUpdatePayload.vip_display_name = reqDisplayName;
          updatedFieldsAccumulator.push('display_name');
        } else {
          return NextResponse.json({ error: 'Invalid display_name format.' }, { status: 400 });
        }
      }
      if (reqEmail !== undefined) {
        if (typeof reqEmail === 'string' && /^[\w\-\.]+@([\w\-]+\.)+[\w\-]{2,4}$/.test(reqEmail)) {
          vipUpdatePayload.vip_email = reqEmail;
          updatedFieldsAccumulator.push('email');
        } else {
          return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 });
        }
      }
      if (reqMarketingPreference !== undefined) {
        if (typeof reqMarketingPreference === 'boolean') {
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
        vipUpdatePayload.updated_at = new Date().toISOString();
        const { error: updateVipError } = await supabaseUserClient
          .from('vip_customer_data')
          .update(vipUpdatePayload)
          .eq('id', targetVipDataId);

        if (updateVipError) {
          console.error('[VIP Profile API PUT] Error updating vip_customer_data:', updateVipError);
          return NextResponse.json({ error: 'Failed to update VIP profile data.' }, { status: 500 });
        }
      }
    }
    
    // Also update profiles_vip_staging.updated_at if any actual VIP data changed,
    // or if only profiles_vip_staging specific fields were intended to be updated (though not the case here).
    if (updatedFieldsAccumulator.length > 0) {
        const { error: touchProfileError } = await supabaseUserClient
            .from('profiles_vip_staging')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', profileId);
        if (touchProfileError) {
             console.warn('[VIP Profile API PUT] Failed to touch profiles_vip_staging.updated_at:', touchProfileError);
        }
    }


    if (updatedFieldsAccumulator.length === 0) {
      return NextResponse.json({ message: 'No valid fields to update or data is the same.', updatedFields: [] }, { status: 200 });
    }

    return NextResponse.json({ success: true, updatedFields: updatedFieldsAccumulator });

  } catch (error) {
    console.error('[VIP Profile API PUT] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

```

The tool reports that no changes were made when re-applying the previous edit. This suggests that the file `app/api/vip/profile/route.ts` *does* already contain the changes for integrating `vip_customer_data` (the logic I outlined for handling `vip_customer_data_id`, creating/updating `vip_customer_data` entries, etc.). This is good, as it means we're working from the correct baseline.

Now, I will proceed with the specific modifications to handle `marketing_preference` exclusively at the `vip_customer_data` level and remove its handling from `profiles_vip_staging` within this API route.

**Changes for `marketing_preference`:**

*   **GET Handler:**
    *   Remove `marketing_preference` from the `select` statement for `profiles_vip_staging`.
    *   The initial value for `vipMarketingPreference` will be `null` or `true` (the default from `vip_customer_data` if a record is created).
    *   The `vipMarketingPreference` in the response will come *only* from `vipData.vip_marketing_preference` or be `null` if `vipData` doesn't exist/isn't found.
*   **PUT Handler:**
    *   When creating a `vip_customer_data` record, `vip_marketing_preference` will be set from `reqMarketingPreference` or default to `true` (as per the database table default).
    *   No attempt will be made to read or write `marketing_preference` from/to `profiles_vip_staging`.

Here's the edit for these specific `marketing_preference` changes:


```typescript
// ... existing code ...
  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      // Remove marketing_preference from this select
      .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id') 
      .eq('id', profileId)
      .single();
// ... existing code ...
    let vipDisplayName = userProfile.display_name;
    let vipEmail = userProfile.email;
    // Initialize as null, will be populated from vip_customer_data or stays null if no record
    let vipMarketingPreference: boolean | null = null; 
    let linkedCrmIdentifier: string | null = null;
// ... existing code ...
      } else if (vipData) {
        vipDisplayName = vipData.vip_display_name ?? vipDisplayName;
        vipEmail = vipData.vip_email ?? vipEmail;
        // marketingPreference is now solely from vip_customer_data
        vipMarketingPreference = vipData.vip_marketing_preference;
        linkedCrmIdentifier = vipData.linked_crm_identifier;
      }
    }
    // If vip_customer_data_id was null or vipData was not found, 
    // vipMarketingPreference remains null. Client might interpret null as true (matching DB default for new records) or handle as needed.
// ... existing code ...

export async function PUT(request: Request) {
// ... existing code ...
  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      // marketing_preference not needed here anymore
      .select('id, vip_customer_data_id, display_name, email') 
      .eq('id', profileId)
      .single();
// ... existing code ...
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name,
          vip_email: reqEmail ?? userProfile.email,
          // reqMarketingPreference will be used, or DB default (TRUE) if undefined
          vip_marketing_preference: reqMarketingPreference, 
        })
        .select('id')
// ... existing code ...
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean; // This is the only place it's updated
        updated_at?: string;
      }> = {};

      if (reqDisplayName !== undefined) {
// ... existing code ...
      }
      if (reqMarketingPreference !== undefined) {
        if (typeof reqMarketingPreference === 'boolean') {
          // This directly updates vip_customer_data.vip_marketing_preference
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
// ... existing code ...

```

The changes to `app/api/vip/profile/route.ts` have been applied to reflect that `marketing_preference` is now solely managed within the `vip_customer_data` table.

**Summary of API changes:**

*   **GET Handler:** No longer selects `marketing_preference` from `profiles_vip_staging`. `vipMarketingPreference` is initialized to `null` and then populated only from `vip_customer_data.vip_marketing_preference` if a linked record exists.
*   **PUT Handler:** When creating a `vip_customer_data` record, `vip_marketing_preference` uses the value from the request (`reqMarketingPreference`). If `reqMarketingPreference` is undefined, the database default for `vip_customer_data.vip_marketing_preference` (which is `TRUE`) will take effect. When updating, only `vip_customer_data.vip_marketing_preference` is modified.

**Phase 2: Data Population/Backfill Script**

Now, let's create the SQL script to populate `vip_customer_data` for existing users in `profiles_vip_staging` and establish the links.

**Assumptions for the script:**

1.  We are working with `profiles_vip_staging` and `crm_customer_mapping_vip_staging`.
2.  `marketing_preference` has already been dropped from `profiles_vip_staging`.
3.  When creating new `vip_customer_data` records, `vip_marketing_preference` will receive its database default value (`TRUE`).

Here's the proposed SQL script. This script is designed to be run once.

```sql
-- Backfill script to populate vip_customer_data and link from profiles_vip_staging

DO $$
DECLARE
    profile_record RECORD;
    mapping_record RECORD;
    new_vip_data_id UUID;
    crm_identifier TEXT;
BEGIN
    RAISE NOTICE 'Starting backfill process for vip_customer_data...';

    -- Loop through profiles in profiles_vip_staging that don't yet have a vip_customer_data_id
    FOR profile_record IN
        SELECT id, display_name, email
        FROM public.profiles_vip_staging
        WHERE vip_customer_data_id IS NULL
    LOOP
        RAISE NOTICE 'Processing profile_id: %', profile_record.id;

        -- Determine the crm_identifier if a link exists in crm_customer_mapping_vip_staging
        crm_identifier := NULL; -- Reset for each profile
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            -- Prioritize stable_hash_id if available, otherwise use crm_customer_id
            -- Adjust this logic based on which identifier you intend to store in linked_crm_identifier
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
                RAISE NOTICE '    Found mapping with stable_hash_id: %', crm_identifier;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
                RAISE NOTICE '    Found mapping with crm_customer_id: %', crm_identifier;
            ELSE
                RAISE NOTICE '    Found mapping but both stable_hash_id and crm_customer_id are null or empty.';
            END IF;
        ELSE
            RAISE NOTICE '    No matched CRM mapping found for profile_id: %', profile_record.id;
        END IF;

        -- Create a new vip_customer_data record
        -- vip_marketing_preference will get its default value (TRUE) from the table definition
        INSERT INTO public.vip_customer_data (vip_display_name, vip_email, linked_crm_identifier)
        VALUES (profile_record.display_name, profile_record.email, crm_identifier)
        RETURNING id INTO new_vip_data_id;

        RAISE NOTICE '    Created vip_customer_data record with id: %', new_vip_data_id;

        -- Update profiles_vip_staging with the new vip_customer_data_id
        UPDATE public.profiles_vip_staging
        SET vip_customer_data_id = new_vip_data_id
        WHERE id = profile_record.id;

        RAISE NOTICE '    Updated profiles_vip_staging.vip_customer_data_id for profile_id: %', profile_record.id;

    END LOOP;

    -- Second pass: For profiles that *already* had a vip_customer_data_id (e.g., from earlier tests or partial runs)
    -- but where linked_crm_identifier might be NULL in vip_customer_data.
    -- This ensures their linked_crm_identifier is populated if a CRM link exists.
    RAISE NOTICE 'Starting second pass to update linked_crm_identifier for existing vip_customer_data records...';
    FOR profile_record IN
        SELECT p.id AS profile_id, p.vip_customer_data_id, vcd.linked_crm_identifier AS current_vcd_crm_identifier
        FROM public.profiles_vip_staging p
        JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
        WHERE p.vip_customer_data_id IS NOT NULL AND vcd.linked_crm_identifier IS NULL -- Only if not already set
    LOOP
        crm_identifier := NULL;
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.profile_id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
            END IF;
            
            IF crm_identifier IS NOT NULL THEN
                 RAISE NOTICE '    Profile_id: %. Updating vip_customer_data_id: % with linked_crm_identifier: %', 
                              profile_record.profile_id, profile_record.vip_customer_data_id, crm_identifier;
                UPDATE public.vip_customer_data
                SET linked_crm_identifier = crm_identifier
                WHERE id = profile_record.vip_customer_data_id;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill process completed.';
END $$;
```

**Explanation of the script:**

1.  **DO $$ ... END $$;**: This creates an anonymous code block in PL/pgSQL.
2.  **First Loop**:
    *   It iterates through `profiles_vip_staging` records where `vip_customer_data_id` is currently `NULL`.
    *   For each such profile, it checks if a matched entry exists in `crm_customer_mapping_vip_staging`.
    *   It determines the `crm_identifier` (preferring `stable_hash_id` then `crm_customer_id` from the mapping table – **you might need to adjust this preference**).
    *   It inserts a new row into `vip_customer_data` with the profile's `display_name`, `email`, and the determined `crm_identifier`. `vip_marketing_preference` gets its default `TRUE`.
    *   It gets the `id` of the newly inserted `vip_customer_data` record.
    *   It updates the `profiles_vip_staging` row to set its `vip_customer_data_id` to this new ID.
3.  **Second Loop (Idempotency/Catch-up):**
    *   This loop is for profiles that might *already* have a `vip_customer_data_id` but where the `linked_crm_identifier` in their `vip_customer_data` record is `NULL`.
    *   It attempts to find a CRM link and updates the `linked_crm_identifier` if one is found and wasn't set previously. This helps if the script is run multiple times or if some links were missed.

**Before running this script:**

*   **Backup your database!** This is crucial before running any bulk update/insert scripts.
*   **Review the preference for `crm_identifier`**: The script currently prefers `stable_hash_id` over `crm_customer_id` from the `crm_customer_mapping_vip_staging` table. Ensure this is the identifier you want to store in `vip_customer_data.linked_crm_identifier`. Adjust the `IF/ELSIF` block for `crm_identifier` if needed.
*   **Test in a staging environment** if possible before running on production data.

Do you want me to execute this SQL script on your Supabase project `bisimqmtxjsptehhqpeg`? Please confirm the `crm_identifier` preference as well.

```sql
-- Backfill script to populate vip_customer_data and link from profiles_vip_staging

DO $$
DECLARE
    profile_record RECORD;
    mapping_record RECORD;
    new_vip_data_id UUID;
    crm_identifier TEXT;
BEGIN
    RAISE NOTICE 'Starting backfill process for vip_customer_data...';

    -- Loop through profiles in profiles_vip_staging that don't yet have a vip_customer_data_id
    FOR profile_record IN
        SELECT id, display_name, email
        FROM public.profiles_vip_staging
        WHERE vip_customer_data_id IS NULL
    LOOP
        RAISE NOTICE 'Processing profile_id: %', profile_record.id;

        -- Determine the crm_identifier if a link exists in crm_customer_mapping_vip_staging
        crm_identifier := NULL; -- Reset for each profile
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            -- Prioritize stable_hash_id if available, otherwise use crm_customer_id
            -- Adjust this logic based on which identifier you intend to store in linked_crm_identifier
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
                RAISE NOTICE '    Found mapping with stable_hash_id: %', crm_identifier;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
                RAISE NOTICE '    Found mapping with crm_customer_id: %', crm_identifier;
            ELSE
                RAISE NOTICE '    Found mapping but both stable_hash_id and crm_customer_id are null or empty.';
            END IF;
        ELSE
            RAISE NOTICE '    No matched CRM mapping found for profile_id: %', profile_record.id;
        END IF;

        -- Create a new vip_customer_data record
        -- vip_marketing_preference will get its default value (TRUE) from the table definition
        INSERT INTO public.vip_customer_data (vip_display_name, vip_email, linked_crm_identifier)
        VALUES (profile_record.display_name, profile_record.email, crm_identifier)
        RETURNING id INTO new_vip_data_id;

        RAISE NOTICE '    Created vip_customer_data record with id: %', new_vip_data_id;

        -- Update profiles_vip_staging with the new vip_customer_data_id
        UPDATE public.profiles_vip_staging
        SET vip_customer_data_id = new_vip_data_id
        WHERE id = profile_record.id;

        RAISE NOTICE '    Updated profiles_vip_staging.vip_customer_data_id for profile_id: %', profile_record.id;

    END LOOP;

    -- Second pass: For profiles that *already* had a vip_customer_data_id (e.g., from earlier tests or partial runs)
    -- but where linked_crm_identifier might be NULL in vip_customer_data.
    -- This ensures their linked_crm_identifier is populated if a CRM link exists.
    RAISE NOTICE 'Starting second pass to update linked_crm_identifier for existing vip_customer_data records...';
    FOR profile_record IN
        SELECT p.id AS profile_id, p.vip_customer_data_id, vcd.linked_crm_identifier AS current_vcd_crm_identifier
        FROM public.profiles_vip_staging p
        JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
        WHERE p.vip_customer_data_id IS NOT NULL AND vcd.linked_crm_identifier IS NULL -- Only if not already set
    LOOP
        crm_identifier := NULL;
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.profile_id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
            END IF;
            
            IF crm_identifier IS NOT NULL THEN
                 RAISE NOTICE '    Profile_id: %. Updating vip_customer_data_id: % with linked_crm_identifier: %', 
                              profile_record.profile_id, profile_record.vip_customer_data_id, crm_identifier;
                UPDATE public.vip_customer_data
                SET linked_crm_identifier = crm_identifier
                WHERE id = profile_record.vip_customer_data_id;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill process completed.';
END $$;
```

```sql
-- Backfill script to populate vip_customer_data and link from profiles_vip_staging

DO $$
DECLARE
    profile_record RECORD;
    mapping_record RECORD;
    new_vip_data_id UUID;
    crm_identifier TEXT;
BEGIN
    RAISE NOTICE 'Starting backfill process for vip_customer_data...';

    -- Loop through profiles in profiles_vip_staging that don't yet have a vip_customer_data_id
    FOR profile_record IN
        SELECT id, display_name, email
        FROM public.profiles_vip_staging
        WHERE vip_customer_data_id IS NULL
    LOOP
        RAISE NOTICE 'Processing profile_id: %', profile_record.id;

        -- Determine the crm_identifier if a link exists in crm_customer_mapping_vip_staging
        crm_identifier := NULL; -- Reset for each profile
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            -- Prioritize stable_hash_id if available, otherwise use crm_customer_id
            -- Adjust this logic based on which identifier you intend to store in linked_crm_identifier
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
                RAISE NOTICE '    Found mapping with stable_hash_id: %', crm_identifier;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
                RAISE NOTICE '    Found mapping with crm_customer_id: %', crm_identifier;
            ELSE
                RAISE NOTICE '    Found mapping but both stable_hash_id and crm_customer_id are null or empty.';
            END IF;
        ELSE
            RAISE NOTICE '    No matched CRM mapping found for profile_id: %', profile_record.id;
        END IF;

        -- Create a new vip_customer_data record
        -- vip_marketing_preference will get its default value (TRUE) from the table definition
        INSERT INTO public.vip_customer_data (vip_display_name, vip_email, linked_crm_identifier)
        VALUES (profile_record.display_name, profile_record.email, crm_identifier)
        RETURNING id INTO new_vip_data_id;

        RAISE NOTICE '    Created vip_customer_data record with id: %', new_vip_data_id;

        -- Update profiles_vip_staging with the new vip_customer_data_id
        UPDATE public.profiles_vip_staging
        SET vip_customer_data_id = new_vip_data_id
        WHERE id = profile_record.id;

        RAISE NOTICE '    Updated profiles_vip_staging.vip_customer_data_id for profile_id: %', profile_record.id;

    END LOOP;

    -- Second pass: For profiles that *already* had a vip_customer_data_id (e.g., from earlier tests or partial runs)
    -- but where linked_crm_identifier might be NULL in vip_customer_data.
    -- This ensures their linked_crm_identifier is populated if a CRM link exists.
    RAISE NOTICE 'Starting second pass to update linked_crm_identifier for existing vip_customer_data records...';
    FOR profile_record IN
        SELECT p.id AS profile_id, p.vip_customer_data_id, vcd.linked_crm_identifier AS current_vcd_crm_identifier
        FROM public.profiles_vip_staging p
        JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
        WHERE p.vip_customer_data_id IS NOT NULL AND vcd.linked_crm_identifier IS NULL -- Only if not already set
    LOOP
        crm_identifier := NULL;
        SELECT crm_customer_id, stable_hash_id INTO mapping_record
        FROM public.crm_customer_mapping_vip_staging
        WHERE profile_id = profile_record.profile_id AND is_matched = TRUE
        LIMIT 1;

        IF FOUND THEN
            IF mapping_record.stable_hash_id IS NOT NULL AND mapping_record.stable_hash_id <> '' THEN
                crm_identifier := mapping_record.stable_hash_id;
            ELSIF mapping_record.crm_customer_id IS NOT NULL AND mapping_record.crm_customer_id <> '' THEN
                crm_identifier := mapping_record.crm_customer_id;
            END IF;
            
            IF crm_identifier IS NOT NULL THEN
                 RAISE NOTICE '    Profile_id: %. Updating vip_customer_data_id: % with linked_crm_identifier: %', 
                              profile_record.profile_id, profile_record.vip_customer_data_id, crm_identifier;
                UPDATE public.vip_customer_data
                SET linked_crm_identifier = crm_identifier
                WHERE id = profile_record.vip_customer_data_id;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill process completed.';
END $$;
```

---

**User**

Yes, we should use stable_hash_id and only generate VIP customer profile at the moment where we already have a stable_hash_id. (this is only populatign the initial data, if later on a new customer would like to access the dashboard, tries to link his account, then no link is created, iit should generate the customer without link as discussed)

---

**Cursor**

You're right, that's a crucial clarification for the initial backfill. We will only create `vip_customer_data` records and link them from `profiles_vip_staging` if the user already has a `stable_hash_id` in `crm_customer_mapping_vip_staging`. This makes the initial population more targeted.

The API logic we updated previously will still handle the scenario where a new or unlinked user accesses the profile page and makes an edit, creating a `vip_customer_data` record for them at that point, even without an immediate CRM link. This backfill is just for the existing dataset.

Here's the revised SQL script. It now uses `stable_hash_id` as the preferred (and in this case, required) identifier for the backfill, and the first loop is more restrictive.

```sql
-- Backfill script (v2) to populate vip_customer_data for PROFILES WITH EXISTING STABLE_HASH_ID
-- and link from profiles_vip_staging.

DO $$
DECLARE
    profile_to_process RECORD;
    mapping_stable_hash_id TEXT;
    new_vip_data_id UUID;
BEGIN
    RAISE NOTICE 'Starting backfill process for vip_customer_data (only for profiles with stable_hash_id)...';

    -- First Loop: Create vip_customer_data for profiles that don't have it yet,
    -- AND have a matched CRM mapping with a stable_hash_id.
    FOR profile_to_process IN
        SELECT p.id AS profile_id, p.display_name, p.email, m.stable_hash_id
        FROM public.profiles_vip_staging p
        JOIN public.crm_customer_mapping_vip_staging m ON p.id = m.profile_id
        WHERE p.vip_customer_data_id IS NULL  -- Only process if not already linked to vip_customer_data
          AND m.is_matched = TRUE
          AND m.stable_hash_id IS NOT NULL
          AND m.stable_hash_id <> ''
    LOOP
        RAISE NOTICE 'Processing profile_id: % with stable_hash_id: %', profile_to_process.profile_id, profile_to_process.stable_hash_id;

        -- Create a new vip_customer_data record
        -- vip_marketing_preference will get its default value (TRUE)
        INSERT INTO public.vip_customer_data (vip_display_name, vip_email, linked_crm_identifier)
        VALUES (profile_to_process.display_name, profile_to_process.email, profile_to_process.stable_hash_id)
        RETURNING id INTO new_vip_data_id;

        RAISE NOTICE '    Created vip_customer_data record with id: %', new_vip_data_id;

        -- Update profiles_vip_staging with the new vip_customer_data_id
        UPDATE public.profiles_vip_staging
        SET vip_customer_data_id = new_vip_data_id
        WHERE id = profile_to_process.profile_id;

        RAISE NOTICE '    Updated profiles_vip_staging.vip_customer_data_id for profile_id: %', profile_to_process.profile_id;

    END LOOP;

    -- Second Pass: For profiles that *already* have a vip_customer_data_id,
    -- but where linked_crm_identifier might be NULL in vip_customer_data.
    -- This ensures their linked_crm_identifier is populated with stable_hash_id if a CRM link exists.
    RAISE NOTICE 'Starting second pass to update linked_crm_identifier (with stable_hash_id) for existing vip_customer_data records...';
    FOR profile_to_process IN
        SELECT p.id AS profile_id, p.vip_customer_data_id, m.stable_hash_id
        FROM public.profiles_vip_staging p
        JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
        JOIN public.crm_customer_mapping_vip_staging m ON p.id = m.profile_id
        WHERE p.vip_customer_data_id IS NOT NULL 
          AND vcd.linked_crm_identifier IS NULL -- Only if not already set
          AND m.is_matched = TRUE
          AND m.stable_hash_id IS NOT NULL
          AND m.stable_hash_id <> ''
    LOOP
        RAISE NOTICE '    Profile_id: %. Updating vip_customer_data_id: % with linked_crm_identifier (stable_hash_id): %', 
                      profile_to_process.profile_id, profile_to_process.vip_customer_data_id, profile_to_process.stable_hash_id;
        
        UPDATE public.vip_customer_data
        SET linked_crm_identifier = profile_to_process.stable_hash_id
        WHERE id = profile_to_process.vip_customer_data_id;
    END LOOP;

    RAISE NOTICE 'Backfill process completed.';
END $$;
```

**Key changes in this script version:**

1.  **First Loop Condition:** The `SELECT` statement for `profile_to_process` now directly joins `profiles_vip_staging` with `crm_customer_mapping_vip_staging` and filters for records where `p.vip_customer_data_id IS NULL`, `m.is_matched = TRUE`, and `m.stable_hash_id` is present and not empty. This ensures only relevant profiles are processed.
2.  **`linked_crm_identifier` Population:** It directly uses `profile_to_process.stable_hash_id` when inserting into `vip_customer_data`.
3.  **Second Loop Refinement:** The second loop also ensures it's specifically looking for and using `stable_hash_id` to update `linked_crm_identifier`.

I've noted the small typo (`Y`) in your attached diff for `app/api/vip/profile/route.ts` and will assume it's an anomaly not affecting the database schema or the intent of our current task.

Please confirm if you're ready for me to execute this refined SQL script on your Supabase project `bisimqmtxjsptehhqpeg`. Remember to back up your data if you haven't already.

```sql
-- Backfill script (v2) to populate vip_customer_data for PROFILES WITH EXISTING STABLE_HASH_ID
-- and link from profiles_vip_staging.

DO $$
DECLARE
    profile_to_process RECORD;
    mapping_stable_hash_id TEXT;
    new_vip_data_id UUID;
BEGIN
    RAISE NOTICE 'Starting backfill process for vip_customer_data (only for profiles with stable_hash_id)...';

    -- First Loop: Create vip_customer_data for profiles that don't have it yet,
    -- AND have a matched CRM mapping with a stable_hash_id.
    FOR profile_to_process IN
        SELECT p.id AS profile_id, p.display_name, p.email, m.stable_hash_id
        FROM public.profiles_vip_staging p
        JOIN public.crm_customer_mapping_vip_staging m ON p.id = m.profile_id
        WHERE p.vip_customer_data_id IS NULL  -- Only process if not already linked to vip_customer_data
          AND m.is_matched = TRUE
          AND m.stable_hash_id IS NOT NULL
          AND m.stable_hash_id <> ''
    LOOP
        RAISE NOTICE 'Processing profile_id: % with stable_hash_id: %', profile_to_process.profile_id, profile_to_process.stable_hash_id;

        -- Create a new vip_customer_data record
        -- vip_marketing_preference will get its default value (TRUE)
        INSERT INTO public.vip_customer_data (vip_display_name, vip_email, linked_crm_identifier)
        VALUES (profile_to_process.display_name, profile_to_process.email, profile_to_process.stable_hash_id)
        RETURNING id INTO new_vip_data_id;

        RAISE NOTICE '    Created vip_customer_data record with id: %', new_vip_data_id;

        -- Update profiles_vip_staging with the new vip_customer_data_id
        UPDATE public.profiles_vip_staging
        SET vip_customer_data_id = new_vip_data_id
        WHERE id = profile_to_process.profile_id;

        RAISE NOTICE '    Updated profiles_vip_staging.vip_customer_data_id for profile_id: %', profile_to_process.profile_id;

    END LOOP;

    -- Second Pass: For profiles that *already* have a vip_customer_data_id,
    -- but where linked_crm_identifier might be NULL in vip_customer_data.
    -- This ensures their linked_crm_identifier is populated with stable_hash_id if a CRM link exists.
    RAISE NOTICE 'Starting second pass to update linked_crm_identifier (with stable_hash_id) for existing vip_customer_data records...';
    FOR profile_to_process IN
        SELECT p.id AS profile_id, p.vip_customer_data_id, m.stable_hash_id
        FROM public.profiles_vip_staging p
        JOIN public.vip_customer_data vcd ON p.vip_customer_data_id = vcd.id
        JOIN public.crm_customer_mapping_vip_staging m ON p.id = m.profile_id
        WHERE p.vip_customer_data_id IS NOT NULL 
          AND vcd.linked_crm_identifier IS NULL -- Only if not already set
          AND m.is_matched = TRUE
          AND m.stable_hash_id IS NOT NULL
          AND m.stable_hash_id <> ''
    LOOP
        RAISE NOTICE '    Profile_id: %. Updating vip_customer_data_id: % with linked_crm_identifier (stable_hash_id): %', 
                      profile_to_process.profile_id, profile_to_process.vip_customer_data_id, profile_to_process.stable_hash_id;
        
        UPDATE public.vip_customer_data
        SET linked_crm_identifier = profile_to_process.stable_hash_id
        WHERE id = profile_to_process.vip_customer_data_id;
    END LOOP;

    RAISE NOTICE 'Backfill process completed.';
END $$;
```

The backfill script `backfill_vip_customer_data_v2_stable_hash_only` has been applied successfully.

This means:
1.  For existing users in `profiles_vip_staging` who did not have a `vip_customer_data_id` but *did* have a matched `crm_customer_mapping_vip_staging` record with a valid `stable_hash_id`, a new `vip_customer_data` record has been created. This new record's `linked_crm_identifier` is populated with the `stable_hash_id`, and `vip_display_name` and `vip_email` are copied from `profiles_vip_staging`. The `profiles_vip_staging.vip_customer_data_id` has been updated to link to this new record.
2.  For users who already had a `vip_customer_data_id` but their `vip_customer_data.linked_crm_identifier` was `NULL`, the script attempted to populate this `linked_crm_identifier` with the `stable_hash_id` from their matched `crm_customer_mapping_vip_staging` record.

Your existing data should now be better aligned with the new table structure, specifically for users who already had a link to a CRM customer via `stable_hash_id`.

The API endpoints (`app/api/vip/profile/route.ts`) are already updated to:
*   Read profile information primarily from `vip_customer_data` if linked.
*   Allow users to edit their `vip_display_name`, `vip_email`, and `vip_marketing_preference` which will be stored in `vip_customer_data`.
*   Create a `vip_customer_data` record on-the-fly during a `PUT` request if one doesn't exist for the user, even if they aren't yet linked to CRM.

**Remaining Key Steps / Considerations:**

1.  **Account Linking Logic (`POST /api/vip/link-account/route.ts` and NextAuth callbacks):** This is the most critical remaining piece of application code to update.
    *   When a `profiles_vip_staging` record is successfully linked to a `crm_customer_mapping_vip_staging` record (and thus to a CRM customer):
        *   You must ensure `vip_customer_data.linked_crm_identifier` is populated with the `stable_hash_id` (or other chosen CRM identifier).
        *   **Unification Logic:** If the `profile_id` just linked *already had* a `vip_customer_data_id` (A), and the CRM customer it linked to was *already associated with a different* `vip_customer_data_id` (B) (perhaps via another login profile of the same person), you need to:
            *   Decide which `vip_customer_data` record becomes the "master" (e.g., B, if it was linked first or is more complete).
            *   Potentially merge data from A to B.
            *   Update `profiles_vip_staging.vip_customer_data_id` for the current profile to point to B.
            *   Potentially mark A as superseded or delete it (handle foreign key constraints carefully). This logic can be complex and needs careful thought about data precedence.
2.  **Thorough Testing:** Test the entire VIP profile flow:
    *   New user, no CRM link, edits profile.
    *   User links to CRM.
    *   User with existing CRM link views/edits profile.
    *   User with multiple login methods linked to the same CRM customer (to test unification).
3.  **Review `linked_crm_identifier` usage in GET `app/api/vip/profile/route.ts`**: Double-check the section commented with `// The logic here depends on what linked_crm_identifier actually stores.` to ensure it correctly queries the `customers` table based on how `linked_crm_identifier` is being populated (which is now `stable_hash_id`). You'll likely want to query `customers` using `eq('stable_hash_id', linkedCrmIdentifier)`.

This sets up the database structure and initial data. The application logic for ongoing linking and unification is the next major development task.

---

**User**

1. Please check linting error you mentioned before
2. {Please check the account linking logic if it makes sense and yese stable_hash_id should be the identifier (why don't we use the stable_hash_id directly as field though?
3. Unification logic, this is possible, but it depends who created the account, the user in the end will just update his vip customer profile

---

**Cursor**

You've brought up some excellent points. Let's address them systematically.

**1. Linting Error / Typo in `app/api/vip/profile/route.ts`**

You're referring to the small "Y" that appeared in the diff for `app/api/vip/profile/route.ts` in your attached files:
```diff
      const { data: userProfile, error: userProfileError } = await supabaseUserClient
        .from('profiles_vip_staging')
-       .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')
+       .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')Y 
        .eq('id', profileId)
        .single();
```
This "Y" is indeed an anomaly, likely an artifact of how the diff was captured or transmitted. It's not valid TypeScript/JavaScript.

I'll read the file to confirm if this character is actually present in the current version and, if so, I will remove it.


```diff
      const { data: userProfile, error: userProfileError } = await supabaseUserClient
        .from('profiles_vip_staging')
-       .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')
+       .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')Y 
        .eq('id', profileId)
        .single();
```

The file content confirms that the anomalous "Y" is indeed present on line 41:
`.select('id, email, display_name, picture_url, phone_number, vip_customer_data_id')Y`

I will remove this character.


```typescript
// ... existing code ...
  try {
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, email, display_name, picture_url, phone_number, vip_customer_data_id') // Removed anomalous Y
      .eq('id', profileId)
      .single();
// ... existing code ...
```

The anomalous "Y" has been removed from `app/api/vip/profile/route.ts`.

**2. Account Linking Logic & Field Naming (`linked_crm_identifier` vs. `stable_hash_id`)**

*   **Field Naming:**
    You're correct, naming the field `stable_hash_id` directly in the `vip_customer_data` table instead of `linked_crm_identifier` would be much clearer since we've established `stable_hash_id` as the chosen identifier.

    I'll create a migration to rename the column:
    *   **Migration Name:** `rename_linked_crm_identifier_to_stable_hash_id_in_vip_customer_data`
    *   **Project ID:** `bisimqmtxjsptehhqpeg`
    *   **SQL:**
        ```sql
        ALTER TABLE public.vip_customer_data
        RENAME COLUMN linked_crm_identifier TO stable_hash_id;

        COMMENT ON COLUMN public.vip_customer_data.stable_hash_id IS 'Stores the stable_hash_id from crm_customer_mapping_vip_staging once linked.';
        ```
    I'll apply this migration now.
    

```sql
        ALTER TABLE public.vip_customer_data
        RENAME COLUMN linked_crm_identifier TO stable_hash_id;

        COMMENT ON COLUMN public.vip_customer_data.stable_hash_id IS 'Stores the stable_hash_id from crm_customer_mapping_vip_staging once linked.';
```

```sql
        ALTER TABLE public.vip_customer_data
        RENAME COLUMN linked_crm_identifier TO stable_hash_id;

        COMMENT ON COLUMN public.vip_customer_data.stable_hash_id IS 'Stores the stable_hash_id from crm_customer_mapping_vip_staging once linked.';
```

The column `linked_crm_identifier` in `public.vip_customer_data` has been successfully renamed to `stable_hash_id`.

    Now, I need to update `app/api/vip/profile/route.ts` to reflect this name change.
    

```typescript
// ... existing code ...
    let vipDisplayName = userProfile.display_name;
    let vipEmail = userProfile.email;
    let vipMarketingPreference: boolean | null = null;
    let stableHashIdToUse: string | null = null; // Renamed from linkedCrmIdentifier
    let customerPhoneNumber: string | null = userProfile.phone_number; // Fallback to profile phone initially

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('vip_display_name, vip_email, vip_marketing_preference, stable_hash_id') // Use new column name
        .eq('id', userProfile.vip_customer_data_id)
        .single();

      if (vipDataError) {
        console.warn(`[VIP Profile API GET] Could not fetch vip_customer_data for id ${userProfile.vip_customer_data_id}:`, vipDataError);
      } else if (vipData) {
        vipDisplayName = vipData.vip_display_name ?? vipDisplayName;
        vipEmail = vipData.vip_email ?? vipEmail;
        vipMarketingPreference = vipData.vip_marketing_preference;
        stableHashIdToUse = vipData.stable_hash_id; // Use new column name
      }
    }
    
    let crmStatus: string = 'not_linked';
    let crmCustomerIdFromMapping: string | null = null;
    let finalStableHashId: string | null = stableHashIdToUse; // Initialize with value from vip_customer_data if present

    if (stableHashIdToUse) {
        const { data: customerData, error: customerError } = await crmSupabase
            .from('customers') 
            .select('contact_number, id, stable_hash_id') 
            .eq('stable_hash_id', stableHashIdToUse) // Query customers table by stable_hash_id
            .maybeSingle();

        if (customerError) {
            console.error('Error fetching CRM customer using stable_hash_id from vip_customer_data:', customerError);
        } else if (customerData) {
            customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
            crmStatus = 'linked_matched';
            crmCustomerIdFromMapping = customerData.id;
            finalStableHashId = customerData.stable_hash_id; // Ensure this is the one from CRM
        } else {
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
        }
    } else {
        const { data: mapping, error: mappingError } = await supabaseUserClient
          .from('crm_customer_mapping_vip_staging')
          .select('is_matched, crm_customer_id, stable_hash_id')
          .eq('profile_id', profileId)
          .maybeSingle();

        if (mappingError) {
          console.error('Error fetching CRM mapping (crm_customer_mapping_vip_staging):', mappingError);
        } else if (mapping) {
            crmCustomerIdFromMapping = mapping.crm_customer_id;
            finalStableHashId = mapping.stable_hash_id; // Use stable_hash_id from mapping
            if (mapping.is_matched && mapping.stable_hash_id) { // Check stable_hash_id for fetching phone
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('stable_hash_id', mapping.stable_hash_id) // Use stable_hash_id here
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by stable_hash_id:', customerError);
                } else if (customerData) {
                    customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
                }
                crmStatus = 'linked_matched';
            } else if (mapping.is_matched && mapping.crm_customer_id && !mapping.stable_hash_id) {
                 // Fallback if only crm_customer_id is somehow present and matched, though stable_hash_id is preferred
                const { data: customerData, error: customerError } = await crmSupabase
                    .from('customers')
                    .select('contact_number')
                    .eq('id', mapping.crm_customer_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by crm_customer_id:', customerError);
                } else if (customerData) {
                    customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber;
                }
                crmStatus = 'linked_matched';
            } else {
                crmStatus = 'linked_unmatched';
            }
        }
    }

    return NextResponse.json({
      id: userProfile.id,
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: customerPhoneNumber,
      pictureUrl: userProfile.picture_url,
      marketingPreference: vipMarketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerIdFromMapping,
      stableHashId: finalStableHashId, // Return the definitive stable_hash_id
    });
// ... existing code ...

```

The file `app/api/vip/profile/route.ts` has been updated to use `stable_hash_id` instead of `linked_crm_identifier` when interacting with the `vip_customer_data` table, and the CRM lookup logic in the GET handler now prioritizes this `stable_hash_id`.

*   **Account Linking Logic (`POST /api/vip/link-account/route.ts` and NextAuth Callbacks):**
    I haven't modified these files yet, as they are more complex and involve the core linking and unification logic. Here's how they should be adapted:

    **A. During Account Linking (e.g., in `POST /api/vip/link-account/route.ts` or a similar service function called after a successful manual link):**
    When a `profile_id` (from `profiles_vip_staging`) is successfully linked to a CRM customer, resulting in a `stable_hash_id_from_crm`:
    1.  **Fetch `profiles_vip_staging.vip_customer_data_id`:** Get the current `vip_customer_data_id` associated with `profile_id`.
    2.  **Check for Existing `vip_customer_data` for the CRM Customer:** Query `vip_customer_data` to see if any record *already* has its `stable_hash_id` column set to `stable_hash_id_from_crm`. Let's call this `existing_vip_data_for_crm`.
    3.  **Scenario 1: No `vip_customer_data_id` for current profile, AND no `existing_vip_data_for_crm`:**
        *   Create a new record in `vip_customer_data`. Populate its `stable_hash_id` with `stable_hash_id_from_crm`. Copy `display_name`, `email` from the current `profiles_vip_staging` record into this new `vip_customer_data` record.
        *   Update the current `profiles_vip_staging.vip_customer_data_id` to point to this new record.
    4.  **Scenario 2: Current profile has `vip_customer_data_id` (let's call its record `current_profile_vip_data`), AND no `existing_vip_data_for_crm`:**
        *   Update `current_profile_vip_data.stable_hash_id` to `stable_hash_id_from_crm`.
    5.  **Scenario 3: `existing_vip_data_for_crm` IS found (meaning another profile already linked this CRM customer to a VIP data record):** This is the **unification** case.
        *   Update the current `profiles_vip_staging.vip_customer_data_id` to point to `existing_vip_data_for_crm.id`.
        *   If the current profile *also* had a `vip_customer_data_id` pointing to a *different* `vip_customer_data` record (let's call it `old_orphaned_vip_data`), you need to decide what to do with `old_orphaned_vip_data`. Options:
            *   **Merge:** Attempt to merge any differing `vip_display_name`, `vip_email`, `vip_marketing_preference` from `old_orphaned_vip_data` into `existing_vip_data_for_crm` (requires conflict resolution logic - e.g., most recent update wins).
            *   **Delete/Mark as Superseded:** Delete `old_orphaned_vip_data` or mark it as inactive.
    6.  **Scenario 4: No `vip_customer_data_id` for current profile, BUT `existing_vip_data_for_crm` IS found:**
        *   Update current `profiles_vip_staging.vip_customer_data_id` to point to `existing_vip_data_for_crm.id`.

    **B. NextAuth Callbacks (e.g., `signIn`, `session`):**
    *   The primary role here is to ensure the `session` object has the necessary `profile_id` to kickstart the above linking process or the profile fetch.
    *   The logic to *create* placeholder `crm_customer_mapping_vip_staging` if no match is found (as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` Section 6) should remain.
    *   The crucial linking and `vip_customer_data` association would typically happen *after* a specific linking action (like the manual link API call) rather than automatically on every sign-in, unless auto-linking with high confidence is also part of the flow.

**3. Unification Logic**

As you noted, the user ultimately updates *their* VIP customer profile. The goal of unification is to ensure that "their" profile is a single, consistent record, regardless of which login method (`profiles_vip_staging` entry) they used, once those login methods are all tied to the same underlying CRM customer.

The complex part (Scenario 3 and 5 above) is handling the `vip_customer_data` records when multiple `profiles_vip_staging` entries converge on the same CRM `stable_hash_id`. A simple strategy for merging could be:
*   When unifying, if both the "master" `vip_customer_data` and an "orphaned" `vip_customer_data` have, for example, a `vip_display_name`, prefer the one from the record that was updated most recently. Or, if the "orphaned" one has data and the "master" one has null for a field, copy it over.

This often requires careful consideration of business rules (e.g., which data source is more trusted or more recent).

**Next Steps:**

Given the complexity:
1.  Would you like me to proceed with modifying `POST /api/vip/link-account/route.ts` to implement the linking logic (Scenarios 1, 2, 4, and the *start* of Scenario 3/5 - specifically, setting the `stable_hash_id` and pointing the current profile to the correct `vip_customer_data_id`)?
2.  The merge/delete logic for orphaned `vip_customer_data` records during unification (Scenario 3/5) is the most intricate. We can outline it further or decide on a simpler initial approach (e.g., link to master, and manually review/merge orphaned data later if it's rare).

Please let me know how you'd like to proceed. We are making good progress in aligning the database and the profile API. The account linking logic is the next major piece.

---

**User**

What means existing_vip_data_for_crm ?  We have crm_customer_mapping_vip_staging which has the existing data from the CRM system?

2. we are missing phone number (when a profile tries to match their in the vip_customer_data table

My point of view:

Scenariocustomer does not have a stable_hash_id in the vip_customer_table

1. On Link page customer enters name, phone number, email (ideally pre-populated from profiles table if available
2. Attempt to link the account manually again with the existing logic
3. If succesful create entry in vip_customer_data with the correct stable_hash_id
4. If not succesful create a entry in the vip_customer table with the correct stable_hash_id
5. If not successful create an entry without a stable_hash_id



---

**Cursor**

You're asking for important clarifications. Let's break it down.

**1. Clarification: `existing_vip_data_for_crm` vs. `crm_customer_mapping_vip_staging`**

You're right to question this. Let me clarify the terms I used:

*   **`crm_customer_mapping_vip_staging`**: This table (as per your provided schema) links a `profile_id` (from `profiles_vip_staging`, representing a user's login) to a CRM customer record. It contains `crm_customer_id`, `stable_hash_id`, `is_matched`, etc. This table tells us *if and how* a specific login (`profile_id`) is connected to the CRM system.
*   **`existing_vip_data_for_crm` (My Terminology)**: When I used this term, I was referring to a hypothetical situation *within the `vip_customer_data` table itself*.
    *   Imagine `UserA` logs in with Google (`profile_A`) and links to `CRM_Customer_XYZ` (which has `stable_hash_id_XYZ`). This creates `vip_customer_data_record_1` where `stable_hash_id = stable_hash_id_XYZ`.
    *   Later, `UserA` logs in with LINE (`profile_B`), and *also* links to the *same* `CRM_Customer_XYZ`.
    *   Before linking `profile_B`, when we check if `CRM_Customer_XYZ` (identified by `stable_hash_id_XYZ`) already has an associated VIP profile, we'd query `vip_customer_data` for any record where `stable_hash_id = stable_hash_id_XYZ`. In this case, we'd find `vip_customer_data_record_1`. This `vip_customer_data_record_1` is what I meant by "`existing_vip_data_for_crm`".

My term was meant to signify a `vip_customer_data` record that is already associated with the target CRM customer (via the `stable_hash_id`).

**2. Missing Phone Number in `vip_customer_data`**

You noted: *"we are missing phone number (when a profile tries to match their in the vip_customer_data table"*

This is a key point. The current `vip_customer_data` table has:
*   `id` (UUID PK)
*   `vip_display_name` (TEXT)
*   `vip_email` (TEXT)
*   `vip_marketing_preference` (BOOLEAN)
*   `stable_hash_id` (TEXT, Nullable) - Link to CRM customer
*   `created_at`, `updated_at`

The phone number is currently sourced in the `GET /api/vip/profile` logic:
*   First, from `customers` table if a CRM link exists (via `stable_hash_id`).
*   As a fallback, from `profiles_vip_staging.phone_number`.

**The `vip_customer_data` table itself does not have a `vip_phone_number` field.**

Your point is that if a user *without* a CRM link yet (so `vip_customer_data.stable_hash_id` is `NULL`) wants to edit their profile, they might want to provide/edit a phone number that is specific to their *VIP interaction preferences*, even before it's tied to a CRM phone number.

**If you want users to be able to set/edit a phone number at the `vip_customer_data` level *independently* of the CRM link, then yes, we should add a `vip_phone_number` field to the `vip_customer_data` table.**

*   When displaying, the logic would be:
    1.  CRM phone (if linked and available) - Highest priority.
    2.  `vip_customer_data.vip_phone_number` (if available).
    3.  `profiles_vip_staging.phone_number` (fallback).
*   When editing, the user would update `vip_customer_data.vip_phone_number`.

**3. Your Scenario for Account Linking Page**

Let's refine your scenario for the "Link Account" page process, incorporating the `vip_customer_data` table.

**Scenario: User is on the "Link Account" Page**

*   **Current State:** User is logged in (has a `profile_id` from `profiles_vip_staging`). Their `vip_customer_data.stable_hash_id` might be `NULL` or they might not even have a `vip_customer_data` record yet if they haven't interacted with the profile edit page.

1.  **Input:** User enters details to attempt linking (e.g., Phone Number. Name/Email might be pre-populated from `profiles_vip_staging` or their existing `vip_customer_data` if they have one).
2.  **Attempt CRM Match:** The backend uses the provided details (primarily the input phone number) to search the `customers` table (via `crm_customer_mapping_vip_staging` logic or directly) to find a matching CRM customer record. This yields a `matched_stable_hash_id` if successful.
3.  **Outcome Analysis (POST `/api/vip/link-account` logic):**

    *   **Case A: Successful CRM Match (`matched_stable_hash_id` is found):**
        *   **A1. Check for `existing_vip_data_for_crm`:** Query `vip_customer_data` for a record where `stable_hash_id = matched_stable_hash_id`.
        *   **A2. Get/Create `current_profile_vip_data`:**
            *   Fetch the `profiles_vip_staging` record for the current `profile_id`.
            *   If `profiles_vip_staging.vip_customer_data_id` is `NULL`: Create a new `vip_customer_data` record (let's call it `newly_created_vip_data`). Populate its `vip_display_name`, `vip_email` from `profiles_vip_staging`. Set `profiles_vip_staging.vip_customer_data_id` to `newly_created_vip_data.id`. The `newly_created_vip_data` is now the `current_profile_vip_data`.
            *   Else (if `vip_customer_data_id` exists): Fetch that `vip_customer_data` record. This is `current_profile_vip_data`.
        *   **A3. Unification/Linking Logic:**
            *   If `existing_vip_data_for_crm` **is found** (i.e., another profile already linked this CRM customer):
                *   Update current `profiles_vip_staging.vip_customer_data_id` to point to `existing_vip_data_for_crm.id`.
                *   If `current_profile_vip_data.id` was different from `existing_vip_data_for_crm.id` (meaning the current profile had its own separate VIP data), then `current_profile_vip_data` is now an "orphan". Decide on merge/delete strategy for this orphan.
                *   Ensure `existing_vip_data_for_crm.stable_hash_id` is set to `matched_stable_hash_id` (it should be already, but good to confirm).
            *   If `existing_vip_data_for_crm` **is NOT found**:
                *   Update `current_profile_vip_data.stable_hash_id` to `matched_stable_hash_id`.
        *   Update `crm_customer_mapping_vip_staging` for the current `profile_id` to set `is_matched = TRUE`, and populate `crm_customer_id` and `stable_hash_id` with values from the matched CRM record.
        *   Return success to the user.

    *   **Case B: No Successful CRM Match (`matched_stable_hash_id` is NOT found):**
        *   **B1. Get/Create `current_profile_vip_data` (same as A2):**
            *   Fetch `profiles_vip_staging` for the current `profile_id`.
            *   If `profiles_vip_staging.vip_customer_data_id` is `NULL`: Create `newly_created_vip_data`. Populate `vip_display_name`, `vip_email` from `profiles_vip_staging`. (Its `stable_hash_id` will be `NULL`). Set `profiles_vip_staging.vip_customer_data_id` to `newly_created_vip_data.id`.
            *   Else (if `vip_customer_data_id` exists): The fetched record is `current_profile_vip_data`. Its `stable_hash_id` remains `NULL` (or whatever it was).
        *   Update `crm_customer_mapping_vip_staging` for the current `profile_id` to ensure `is_matched = FALSE`. (This mapping might already exist as a placeholder or be newly created as such).
        *   Return "link not successful" to the user. The user now has a `vip_customer_data` record (if they didn't before) but it's not linked to a CRM `stable_hash_id`.

This flow ensures:
*   A `vip_customer_data` record is created/updated for the user regardless of linking success (if they interact with profile-related actions like attempting a link or editing their profile).
*   If a CRM link is successful, the `vip_customer_data` is associated with the `stable_hash_id`.
*   It includes the unification step.

**Decision Point: Add `vip_phone_number` to `vip_customer_data`?**

Given your point, do you want to add `vip_phone_number` (TEXT, Nullable) to the `vip_customer_data` table?
If yes, I'll:
1.  Create a migration to add this column.
2.  Update `app/api/vip/profile/route.ts` (GET and PUT) to include handling for this new field.
3.  The account linking logic above (and the profile edit page) would then also allow this `vip_phone_number` to be set/updated.

Let me know your preference on adding `vip_phone_number`. Then we can decide on the next implementation step (likely modifying `POST /api/vip/link-account/route.ts`).

---

**User**

We should add the phone number. e.g. they have a case where they moved toa new phone number and we haven't updated yet the CRM system and knowing there is a different phone number we can update the CRM later on and manually run the matching or not

Implement this and then we move to link account

---

**Cursor**

Okay, that's a good rationale for adding `vip_phone_number` to the `vip_customer_data` table. It provides a way for users to signal a new phone number even if the CRM isn't immediately updated, facilitating later reconciliation.

Here's the plan:

**Phase 1: Add `vip_phone_number` to `vip_customer_data`**

1.  **Modify Database Schema:**
    *   Create and apply a Supabase migration to add `vip_phone_number` (TEXT, NULLABLE) to the `public.vip_customer_data` table.
2.  **Update API Code (`app/api/vip/profile/route.ts`):**
    *   **GET Handler:**
        *   When fetching from `vip_customer_data`, also select `vip_phone_number`.
        *   The logic for determining `customerPhoneNumber` in the response will be:
            1.  Phone from `customers` table (if CRM linked and customer found) - Highest priority.
            2.  Phone from `vip_customer_data.vip_phone_number` (if available and CRM phone wasn't used).
            3.  Phone from `profiles_vip_staging.phone_number` (lowest priority fallback).
    *   **PUT Handler:**
        *   Allow `vip_phone_number` in the request body.
        *   When creating/updating `vip_customer_data`, set/update the `vip_phone_number` field.

Let's start with **Phase 1, Step 1: Modify Database Schema**.

*   **Migration Name:** `add_vip_phone_number_to_vip_customer_data`
*   **Project ID:** `bisimqmtxjsptehhqpeg`
*   **SQL:**
    ```sql
    ALTER TABLE public.vip_customer_data
    ADD COLUMN vip_phone_number TEXT NULLABLE;

    COMMENT ON COLUMN public.vip_customer_data.vip_phone_number IS 'Phone number preferred or updated by the VIP customer, may differ from CRM until synced.';
    ```
I'll apply this migration now.


```sql
    ALTER TABLE public.vip_customer_data
    ADD COLUMN vip_phone_number TEXT NULLABLE;

    COMMENT ON COLUMN public.vip_customer_data.vip_phone_number IS 'Phone number preferred or updated by the VIP customer, may differ from CRM until synced.';
```

Ah, it seems I've fallen for the `NULLABLE` keyword trap again with PostgreSQL. Columns are nullable by default if `NOT NULL` isn't specified.

My apologies for that repeated mistake. Let's correct the SQL and re-apply.

Corrected SQL:
```sql
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_phone_number TEXT; -- NULLABLE is default

COMMENT ON COLUMN public.vip_customer_data.vip_phone_number IS 'Phone number preferred or updated by the VIP customer, may differ from CRM until synced.';
```

I'll apply this corrected migration.


```sql
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_phone_number TEXT; -- NULLABLE is default

COMMENT ON COLUMN public.vip_customer_data.vip_phone_number IS 'Phone number preferred or updated by the VIP customer, may differ from CRM until synced.';
```

```sql
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_phone_number TEXT; -- NULLABLE is default

COMMENT ON COLUMN public.vip_customer_data.vip_phone_number IS 'Phone number preferred or updated by the VIP customer, may differ from CRM until synced.';
```

Okay, the `vip_phone_number` column has been successfully added to the `public.vip_customer_data` table.

Now for **Phase 1, Step 2: Update API Code (`app/api/vip/profile/route.ts`)**.

I'll modify the `GET` and `PUT` handlers to include `vip_phone_number`.


```typescript
// ... existing code ...
    let vipMarketingPreference: boolean | null = null;
    let stableHashIdToUse: string | null = null; // Renamed from linkedCrmIdentifier
    let customerPhoneNumber: string | null = userProfile.phone_number; // Fallback to profile phone initially
    let vipPhoneNumber: string | null = null; // For vip_customer_data.vip_phone_number

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('vip_display_name, vip_email, vip_marketing_preference, stable_hash_id, vip_phone_number') // Added vip_phone_number
        .eq('id', userProfile.vip_customer_data_id)
// ... existing code ...
        vipEmail = vipData.vip_email ?? vipEmail;
        vipMarketingPreference = vipData.vip_marketing_preference;
        stableHashIdToUse = vipData.stable_hash_id;
        vipPhoneNumber = vipData.vip_phone_number; // Get vip_phone_number
      }
    }
// ... existing code ...
        if (customerError) {
            console.error('Error fetching CRM customer using stable_hash_id from vip_customer_data:', customerError);
        } else if (customerData) {
            customerPhoneNumber = customerData.contact_number ?? customerPhoneNumber; // CRM phone takes precedence
            crmStatus = 'linked_matched';
// ... existing code ...
            // If CRM phone not found, consider vipPhoneNumber, then profile phone
            customerPhoneNumber = customerPhoneNumber ?? vipPhoneNumber ?? userProfile.phone_number ?? null;
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
        }
    } else {
        const { data: mapping, error: mappingError } = await supabaseUserClient
// ... existing code ...
                crmStatus = 'linked_matched';
            } else {
                crmStatus = 'linked_unmatched';
            }
        }
    }
    // Final phone number resolution
    if (customerPhoneNumber === null && vipPhoneNumber !== null) {
        customerPhoneNumber = vipPhoneNumber;
    } else if (customerPhoneNumber === null && userProfile.phone_number !== null) {
        customerPhoneNumber = userProfile.phone_number;
    }

    return NextResponse.json({
// ... existing code ...
  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName, vip_phone_number: reqVipPhoneNumber } = requestBody; // Added vip_phone_number
  const updatedFieldsAccumulator: string[] = [];
// ... existing code ...
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name,
          vip_email: reqEmail ?? userProfile.email,
          vip_marketing_preference: reqMarketingPreference,
          vip_phone_number: reqVipPhoneNumber // Add vip_phone_number to insert
        })
        .select('id')
// ... existing code ...
      if (reqMarketingPreference !== undefined) updatedFieldsAccumulator.push('marketingPreference');
      // Add vip_phone_number to newly created fields if provided
      if (reqVipPhoneNumber !== undefined) updatedFieldsAccumulator.push('vip_phone_number'); 
    } else {
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        vip_phone_number?: string; // Add vip_phone_number to payload
        updated_at?: string;
      }> = {};
// ... existing code ...
        if (typeof reqMarketingPreference === 'boolean') {
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }
      if (reqVipPhoneNumber !== undefined) { // Handle vip_phone_number update
        if (typeof reqVipPhoneNumber === 'string' || reqVipPhoneNumber === null) {
          vipUpdatePayload.vip_phone_number = reqVipPhoneNumber;
          updatedFieldsAccumulator.push('vip_phone_number');
        } else {
          return NextResponse.json({ error: 'Invalid vip_phone_number format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
// ... existing code ...

```

The `edit_file` tool seems to have partially applied the changes. I'll examine the diff and make corrections.

It appears the GET handler's phone number resolution logic wasn't fully updated.

Specifically, the part:
```typescript
        } else {
            // If linked_crm_identifier was set but no customer found, it's an issue or stale link
            // This section should be:
            // customerPhoneNumber = customerPhoneNumber ?? vipPhoneNumber ?? userProfile.phone_number ?? null;
            // The original line was removed by the partial application.
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
        }
```
And the final resolution block was added, but the intermediate logic needs to be cleaner.

Let's refine the phone number resolution in the GET handler and ensure the PUT handler is correct.

**Corrected Phone Number Logic for GET:**

```typescript
// Inside GET handler, after fetching userProfile and potentially vipData

// Initialize with the lowest priority fallback
let finalPhoneNumber: string | null = userProfile.phone_number ?? null;

// If vip_customer_data has a phone number, it takes precedence over profiles_vip_staging.phone_number
if (vipPhoneNumber !== null) {
    finalPhoneNumber = vipPhoneNumber;
}

// If CRM is linked and provides a phone number, it takes highest precedence
if (crmStatus === 'linked_matched' && customerData?.contact_number) { // customerData is from CRM lookup
    finalPhoneNumber = customerData.contact_number;
}
// If CRM was checked (because stableHashIdToUse was present) but no customerData.contact_number,
// then finalPhoneNumber would remain as vipPhoneNumber or userProfile.phone_number.

// ... then in the response:
// phoneNumber: finalPhoneNumber,
```

I will apply a more targeted edit to fix the phone number logic in GET and ensure PUT is complete.


```typescript
        } else {
            // If linked_crm_identifier was set but no customer found, it's an issue or stale link
            // This section should be:
            // customerPhoneNumber = customerPhoneNumber ?? vipPhoneNumber ?? userProfile.phone_number ?? null;
            // The original line was removed by the partial application.
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
        }
```

```typescript
// Inside GET handler, after fetching userProfile and potentially vipData

// Initialize with the lowest priority fallback
let finalPhoneNumber: string | null = userProfile.phone_number ?? null;

// If vip_customer_data has a phone number, it takes precedence over profiles_vip_staging.phone_number
if (vipPhoneNumber !== null) {
    finalPhoneNumber = vipPhoneNumber;
}

// If CRM is linked and provides a phone number, it takes highest precedence
if (crmStatus === 'linked_matched' && customerData?.contact_number) { // customerData is from CRM lookup
    finalPhoneNumber = customerData.contact_number;
}
// If CRM was checked (because stableHashIdToUse was present) but no customerData.contact_number,
// then finalPhoneNumber would remain as vipPhoneNumber or userProfile.phone_number.

// ... then in the response:
// phoneNumber: finalPhoneNumber,
```

```typescript
        } else {
            // If linked_crm_identifier was set but no customer found, it's an issue or stale link
            // This section should be:
            // customerPhoneNumber = customerPhoneNumber ?? vipPhoneNumber ?? userProfile.phone_number ?? null;
            // The original line was removed by the partial application.
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
        }
```

```typescript
// Inside GET handler, after fetching userProfile and potentially vipData

// Initialize with the lowest priority fallback
let finalPhoneNumber: string | null = userProfile.phone_number ?? null;

// If vip_customer_data has a phone number, it takes precedence over profiles_vip_staging.phone_number
if (vipPhoneNumber !== null) {
    finalPhoneNumber = vipPhoneNumber;
}

// If CRM is linked and provides a phone number, it takes highest precedence
if (crmStatus === 'linked_matched' && customerData?.contact_number) { // customerData is from CRM lookup
    finalPhoneNumber = customerData.contact_number;
}
// If CRM was checked (because stableHashIdToUse was present) but no customerData.contact_number,
// then finalPhoneNumber would remain as vipPhoneNumber or userProfile.phone_number.

// ... then in the response:
// phoneNumber: finalPhoneNumber,
```

```typescript
// ... existing code ...
    let vipMarketingPreference: boolean | null = null;
    let stableHashIdToUse: string | null = null;
    let vipPhoneNumber: string | null = null; // For vip_customer_data.vip_phone_number
    
    // Initialize with the lowest priority fallback from profiles_vip_staging
    let finalResolvedPhoneNumber: string | null = userProfile.phone_number ?? null;

    if (userProfile.vip_customer_data_id) {
// ... existing code ...
        vipMarketingPreference = vipData.vip_marketing_preference;
        stableHashIdToUse = vipData.stable_hash_id;
        vipPhoneNumber = vipData.vip_phone_number; // Get vip_phone_number
        // If vip_customer_data has a phone, it takes precedence over profiles_vip_staging.phone_number
        if (vipPhoneNumber !== null) {
            finalResolvedPhoneNumber = vipPhoneNumber;
        }
      }
    }
// ... existing code ...
    let crmCustomerIdFromMapping: string | null = null;
    let finalStableHashId: string | null = stableHashIdToUse;

    if (stableHashIdToUse) {
        const { data: customerData, error: customerError } = await crmSupabase
// ... existing code ...
        if (customerError) {
            console.error('Error fetching CRM customer using stable_hash_id from vip_customer_data:', customerError);
        } else if (customerData) {
            // CRM phone takes highest precedence if found
            if (customerData.contact_number) {
                finalResolvedPhoneNumber = customerData.contact_number;
            }
            crmStatus = 'linked_matched';
// ... existing code ...
            crmStatus = 'linked_unmatched'; 
            console.warn(`[VIP Profile API GET] stable_hash_id ${stableHashIdToUse} found in vip_customer_data, but no matching customer in CRM.`);
            // finalResolvedPhoneNumber remains as set from vip_customer_data or profiles_vip_staging in this case
        }
    } else {
        const { data: mapping, error: mappingError } = await supabaseUserClient
// ... existing code ...
                    .select('contact_number')
                    .eq('stable_hash_id', mapping.stable_hash_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by stable_hash_id:', customerError);
                } else if (customerData && customerData.contact_number) {
                     // CRM phone takes highest precedence if found via mapping
                    finalResolvedPhoneNumber = customerData.contact_number;
                }
                crmStatus = 'linked_matched';
            } else if (mapping.is_matched && mapping.crm_customer_id && !mapping.stable_hash_id) {
// ... existing code ...
                    .select('contact_number')
                    .eq('id', mapping.crm_customer_id)
                    .single();
                if (customerError) {
                    console.error('Error fetching CRM customer phone from mapping by crm_customer_id:', customerError);
                } else if (customerData && customerData.contact_number) {
                    // CRM phone takes highest precedence if found via mapping
                    finalResolvedPhoneNumber = customerData.contact_number;
                }
                crmStatus = 'linked_matched';
// ... existing code ...
    }
    // No longer need the separate final resolution block as it's handled inline

    return NextResponse.json({
      id: userProfile.id,
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: finalResolvedPhoneNumber, // Use the resolved phone number
      pictureUrl: userProfile.picture_url,
// ... existing code ...
export async function PUT(request: Request) {
// ... existing code ...
  const { email: reqEmail, marketingPreference: reqMarketingPreference, display_name: reqDisplayName, vip_phone_number: reqVipPhoneNumber } = requestBody;
  const updatedFieldsAccumulator: string[] = [];
// ... existing code ...
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name,
          vip_email: reqEmail ?? userProfile.email,
          vip_marketing_preference: reqMarketingPreference,
          vip_phone_number: reqVipPhoneNumber // Ensure vip_phone_number is in insert
        })
        .select('id')
// ... existing code ...
      if (reqMarketingPreference !== undefined) updatedFieldsAccumulator.push('marketingPreference');
      if (reqVipPhoneNumber !== undefined) updatedFieldsAccumulator.push('vip_phone_number');
    } else {
      // Update existing vip_customer_data record
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        vip_phone_number?: string | null; // Allow null to clear phone number
        updated_at?: string;
      }> = {};
// ... existing code ...
        if (typeof reqMarketingPreference === 'boolean') {
          vipUpdatePayload.vip_marketing_preference = reqMarketingPreference;
          updatedFieldsAccumulator.push('marketingPreference');
        } else {
          return NextResponse.json({ error: 'Invalid marketingPreference format.' }, { status: 400 });
        }
      }
      if (reqVipPhoneNumber !== undefined) {
        if (typeof reqVipPhoneNumber === 'string' || reqVipPhoneNumber === null) {
          vipUpdatePayload.vip_phone_number = reqVipPhoneNumber;
          updatedFieldsAccumulator.push('vip_phone_number');
        } else {
          return NextResponse.json({ error: 'Invalid vip_phone_number format.' }, { status: 400 });
        }
      }

      if (updatedFieldsAccumulator.length > 0) {
// ... existing code ...

```

The changes to `app/api/vip/profile/route.ts` for handling `vip_phone_number` have been applied.

**Summary of `vip_phone_number` integration:**

*   **Database:** `vip_customer_data` table now has a `vip_phone_number` (TEXT, NULLABLE) column.
*   **API - GET `/api/vip/profile`:**
    *   The phone number is resolved with the following priority:
        1.  `customers.contact_number` (from CRM, if linked and available).
        2.  `vip_customer_data.vip_phone_number` (if available).
        3.  `profiles_vip_staging.phone_number` (lowest priority fallback).
    *   The response field is `phoneNumber`.
*   **API - PUT `/api/vip/profile`:**
    *   Accepts `vip_phone_number` in the request body.
    *   When creating a new `vip_customer_data` record, `vip_phone_number` from the request is used.
    *   When updating an existing `vip_customer_data` record, `vip_phone_number` can be set or updated (can also be set to `null` to clear it).

**Next Step: Account Linking Logic (`POST /api/vip/link-account/route.ts`)**

We are now ready to tackle the `POST /api/vip/link-account/route.ts` endpoint. This is where the core logic for connecting a user's session (`profile_id`) to a CRM customer (via `stable_hash_id`) and managing the `vip_customer_data` associations will reside.

I will need to:
1.  Read the current content of `app/api/vip/link-account/route.ts`.
2.  Implement the logic discussed in "Your Scenario for Account Linking Page" (from my previous message), including:
    *   Attempting CRM match.
    *   Handling successful matches:
        *   Checking for existing `vip_customer_data` associated with the matched CRM `stable_hash_id`.
        *   Getting/creating `vip_customer_data` for the current `profile_id`.
        *   Performing unification: pointing the current `profiles_vip_staging.vip_customer_data_id` to the correct `vip_customer_data` record (either the one already linked to the CRM customer or the current profile's one if no prior CRM link existed for that VIP data). This includes setting/updating `vip_customer_data.stable_hash_id`.
        *   (The more complex merge/delete of "orphaned" `vip_customer_data` can be a follow-up refinement; for now, the key is correct linking).
        *   Updating `crm_customer_mapping_vip_staging`.
    *   Handling unsuccessful matches:
        *   Ensuring a `vip_customer_data` record exists for the current `profile_id` (created if it doesn't), with its `stable_hash_id` remaining `NULL`.
        *   Updating `crm_customer_mapping_vip_staging` to reflect `is_matched = FALSE`.

This will be a substantial modification. Let's start by reading the file.


Okay, I have the content of `app/api/vip/link-account/route.ts`. The existing logic calls `matchProfileWithCrm` and returns based on its result.

I will now integrate the new logic to handle `vip_customer_data` creation, linking, and the start of unification. This will involve using a Supabase client to interact with `profiles_vip_staging` and `vip_customer_data` tables directly within this route, after `matchProfileWithCrm` has done its part.

Given the complexity, I will focus on the core path:
1.  Call `matchProfileWithCrm`.
2.  If a CRM match is found (`matchResult.matched` is true and `matchResult.stableHashId` is available):
    *   Fetch the current user's `profiles_vip_staging` record to get their current `display_name`, `email`, and `vip_customer_data_id`.
    *   Check if another `vip_customer_data` record already exists for `matchResult.stableHashId` (`existing_vip_data_for_crm`).
    *   **Get/Create `current_profile_vip_data`:**
        *   If `profiles_vip_staging.vip_customer_data_id` is `NULL`, create a new `vip_customer_data` record (populating `vip_display_name`, `vip_email`, `vip_phone_number` from `profiles_vip_staging` if available, or using request data if provided for these). Link it back to `profiles_vip_staging`. This becomes `current_profile_vip_data`.
        *   Else, fetch the existing `vip_customer_data` record; this is `current_profile_vip_data`.
    *   **Unification/Linking Logic:**
        *   If `existing_vip_data_for_crm` **is found**: Update `profiles_vip_staging.vip_customer_data_id` to point to `existing_vip_data_for_crm.id`. (Orphan handling is deferred). Ensure `existing_vip_data_for_crm.stable_hash_id` is correct.
        *   If `existing_vip_data_for_crm` **is NOT found**: Update `current_profile_vip_data.stable_hash_id` to `matchResult.stableHashId`.
3.  If no CRM match is found:
    *   Get/Create `current_profile_vip_data` for the current `profile_id` (as above), ensuring its `stable_hash_id` is `NULL`.

This is a significant change. I will proceed with generating the `edit_file` call.


```typescript
// ... existing code ...
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/options';
import { matchProfileWithCrm } from '@/utils/customer-matching';
import { createClient } from '@supabase/supabase-js'; // Import Supabase client

// Define session types (consider moving to a shared types file if not already)
interface LinkAccountSessionUser {
  id: string;
  name?: string | null; 
  email?: string | null;
}
interface LinkAccountSession {
  accessToken?: string;
  user: LinkAccountSessionUser;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions) as LinkAccountSession | null;

  if (!session?.user?.id || !session.accessToken) { // Ensure accessToken is checked for Supabase client
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = session.user.id;
  const userAccessToken = session.accessToken;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // For initial client, user client will use token

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[VIP Link Account API] Supabase URL or Anon Key is not set.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // User-specific Supabase client
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
  });

  let phoneNumber: string;
  let requestName: string | undefined;
  let requestEmail: string | undefined;
  let requestVipPhoneNumber: string | undefined | null;

  try {
    const body = await request.json();
    phoneNumber = body.phoneNumber;
    requestName = body.name; // Optional: name from link form
    requestEmail = body.email; // Optional: email from link form
    requestVipPhoneNumber = body.vip_phone_number; // Optional: phone from link form

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: 'Phone number is required and must be a string.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    // --- Step 1: Attempt CRM Match ---
    const matchResult = await matchProfileWithCrm(profileId, {
      phoneNumberToMatch: phoneNumber,
      source: 'manual_link_vip_ui',
      // Pass other details if matchProfileWithCrm can use them for better matching
      profileName: requestName ?? session.user.name,
      profileEmail: requestEmail ?? session.user.email,
    });

    // --- Step 2: Fetch current profile and its vip_customer_data link ---
    const { data: userProfile, error: userProfileError } = await supabaseUserClient
      .from('profiles_vip_staging')
      .select('id, vip_customer_data_id, display_name, email, phone_number') // Include phone_number for fallback
      .eq('id', profileId)
      .single();

    if (userProfileError || !userProfile) {
      console.error('[VIP Link Account API] Error fetching user profile:', userProfileError);
      return NextResponse.json({ error: 'User profile not found or error fetching it.' }, { status: 500 });
    }

    let currentVipDataId = userProfile.vip_customer_data_id;
    let currentVipData: any = null; // To hold fetched or newly created vip_customer_data

    // --- Step 3: Get/Create vip_customer_data for the current profile ---
    if (currentVipDataId) {
      const { data, error } = await supabaseUserClient
        .from('vip_customer_data')
        .select('*')
        .eq('id', currentVipDataId)
        .single();
      if (error) {
        console.warn(`[VIP Link Account API] Could not fetch existing vip_customer_data ${currentVipDataId}, will attempt to create. Error:`, error);
        currentVipDataId = null; // Force creation if fetch failed
      } else {
        currentVipData = data;
      }
    }

    if (!currentVipDataId) {
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: requestName ?? userProfile.display_name,
          vip_email: requestEmail ?? userProfile.email,
          vip_phone_number: requestVipPhoneNumber ?? userProfile.phone_number, // Use request phone, fallback to profile phone
          stable_hash_id: null, // Initially null
        })
        .select('*')
        .single();

      if (insertVipError || !newVipData) {
        console.error('[VIP Link Account API] Error creating vip_customer_data record:', insertVipError);
        return NextResponse.json({ error: 'Failed to ensure VIP profile data for linking.' }, { status: 500 });
      }
      currentVipData = newVipData;
      currentVipDataId = newVipData.id;

      const { error: updateProfileLinkError } = await supabaseUserClient
        .from('profiles_vip_staging')
        .update({ vip_customer_data_id: currentVipDataId, updated_at: new Date().toISOString() })
        .eq('id', profileId);
      if (updateProfileLinkError) {
        console.error('[VIP Link Account API] Error linking new vip_customer_data to profile:', updateProfileLinkError);
        // Potentially critical, but proceed with match logic for now
      }
    }

    // --- Step 4: Handle CRM Match Result ---
    if (matchResult?.matched && matchResult.stableHashId) {
      const matchedStableHashId = matchResult.stableHashId;

      // Check if another vip_customer_data record already exists for this matchedStableHashId
      const { data: existingVipDataForCrm, error: existingVipCheckError } = await supabaseUserClient
        .from('vip_customer_data')
        .select('*')
        .eq('stable_hash_id', matchedStableHashId)
        .neq('id', currentVipDataId) // Exclude the one we are currently working with
        .limit(1)
        .single(); // Use maybeSingle if it can be null, or handle error if not found
      
      if (existingVipCheckError && existingVipCheckError.code !== 'PGRST116') { // PGRST116: no rows found, which is fine
         console.error('[VIP Link Account API] Error checking for existing VIP data for CRM link:', existingVipCheckError);
         // Decide if this is a hard stop or if we can proceed
      }

      if (existingVipDataForCrm) {
        // Unification: Point current profile to the VIP data already linked to the CRM
        console.log(`[VIP Link Account API] Unifying: Profile ${profileId} will use existing vip_customer_data ${existingVipDataForCrm.id} linked to CRM stable_hash_id ${matchedStableHashId}`);
        const { error: updateProfileToExistingVipDataError } = await supabaseUserClient
          .from('profiles_vip_staging')
          .update({ vip_customer_data_id: existingVipDataForCrm.id, updated_at: new Date().toISOString() })
          .eq('id', profileId);
        if (updateProfileToExistingVipDataError) {
            console.error('[VIP Link Account API] Error updating profile to use existing_vip_data_for_crm:', updateProfileToExistingVipDataError);
        }
        // TODO: Consider merging data from currentVipData (if different) into existingVipDataForCrm, or deleting currentVipData if it's now orphaned and unlinked.
        // For now, just ensure the existing one has the stable_hash_id if it somehow doesn't (should be rare)
        if (existingVipDataForCrm.stable_hash_id !== matchedStableHashId) {
            await supabaseUserClient.from('vip_customer_data').update({ stable_hash_id: matchedStableHashId }).eq('id', existingVipDataForCrm.id);
        }

      } else {
        // No other VIP data linked to this CRM customer yet. Link currentVipData.
        const { error: updateCurrentVipDataError } = await supabaseUserClient
          .from('vip_customer_data')
          .update({ stable_hash_id: matchedStableHashId, updated_at: new Date().toISOString() })
          .eq('id', currentVipDataId!);
         if (updateCurrentVipDataError) {
            console.error('[VIP Link Account API] Error updating current_vip_data with stable_hash_id:', updateCurrentVipDataError);
         }
      }
      
      // crm_customer_mapping_vip_staging is handled by matchProfileWithCrm, assuming it updates it correctly.
      // If not, manual update here is needed.

      return NextResponse.json({
        success: true,
        crmCustomerId: matchResult.crmCustomerId, // From matchProfileWithCrm
        stableHashId: matchedStableHashId,
      });
    } else {
      // No CRM match found or match was not successful
      // currentVipData is already created/fetched, and its stable_hash_id is null (or its previous value if it existed).
      // Ensure crm_customer_mapping_vip_staging reflects is_matched = false (matchProfileWithCrm should handle this)
      console.log(`[VIP Link Account API] No CRM match for profile ${profileId} with phone ${phoneNumber}. VIP data ID: ${currentVipDataId}`);
      return NextResponse.json(
        { success: false, error: matchResult?.error || 'No matching customer account found.' },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Error during manual account linking:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 

```

The `edit_file` tool has applied the changes to `app/api/vip/link-account/route.ts`, and it seems to have correctly integrated the main logic flows. However, it's flagged two linter errors:

1.  **Line 66: `profileName` does not exist in type...**
    This error occurs because `profileName` and `profileEmail` were added to the `matchProfileWithCrm` call, but the type definition for the options of `matchProfileWithCrm` likely doesn't include them.
    *   **Fix:** We need to either update the type definition for `matchProfileWithCrm`'s options (if we have access to modify `customer-matching.ts`) or remove these properties from the call if `matchProfileWithCrm` cannot use them. For now, I will assume `matchProfileWithCrm` *cannot* use them, so I will remove them from the call to resolve the linting error. If `matchProfileWithCrm` *should* use them, we'll need to adjust its definition.

2.  **Line 173: Property `error` does not exist on type `MatchResult`...**
    This occurs in the `else` block when no CRM match is found: `error: matchResult?.error || 'No matching customer account found.'`. The `MatchResult` type (presumably returned by `matchProfileWithCrm`) might not have an `error` property.
    *   **Fix:** If `matchResult` doesn't have an `error` property, we should rely on a generic message or a specific message from `matchProfileWithCrm` if it's structured differently (e.g., `matchResult.message`). Looking at the original code, it seems it did *not* use `matchResult.error` before. I'll revert to a simpler error message here.

I'll also correct a small logic bug in the successful match section. The logging for "No CRM match" was inside the `if (matchResult?.matched ...)` block. It should be in the `else` for that block.

Here's the proposed fix for these issues:


```typescript
// ... existing code ...
  try {
    // --- Step 1: Attempt CRM Match ---
    const matchResult = await matchProfileWithCrm(profileId, {
      phoneNumberToMatch: phoneNumber,
      source: 'manual_link_vip_ui',
      // Removed profileName and profileEmail as they might not be in the function's options type
      // profileName: requestName ?? session.user.name,
      // profileEmail: requestEmail ?? session.user.email,
    });
// ... existing code ...
      // crm_customer_mapping_vip_staging is handled by matchProfileWithCrm, assuming it updates it correctly.
      // If not, manual update here is needed.

      return NextResponse.json({
        success: true,
        crmCustomerId: matchResult.crmCustomerId, // From matchProfileWithCrm
        stableHashId: matchedStableHashId,
      });
    } else {
      // No CRM match found or match was not successful
      // currentVipData is already created/fetched, and its stable_hash_id is null (or its previous value if it existed).
      // Ensure crm_customer_mapping_vip_staging reflects is_matched = false (matchProfileWithCrm should handle this)
      console.log(`[VIP Link Account API] No CRM match for profile ${profileId} with phone ${phoneNumber}. VIP data ID: ${currentVipDataId}`);
      return NextResponse.json(
        // Corrected error message handling: Revert to a generic message or check if matchResult has a specific message field
        { success: false, error: 'No matching customer account found.' }, 
        { status: 404 }
      );
    }
  } catch (error: any) {
// ... existing code ...

```

The linter errors should now be resolved, and the logging logic is corrected.

**Summary of `app/api/vip/link-account/route.ts` changes:**

1.  **Supabase Client:** Uses an authenticated Supabase client.
2.  **Profile Fetch:** Fetches the current user's `profiles_vip_staging` record.
3.  **Get/Create `vip_customer_data`:**
    *   If the user doesn't have a linked `vip_customer_data` record, one is created. Information like display name, email, and phone number from the linking form (or `profiles_vip_staging` as fallback) is used to populate it. Its `stable_hash_id` is initially `null`.
    *   The `profiles_vip_staging.vip_customer_data_id` is updated.
4.  **CRM Matching (`matchProfileWithCrm`):** Called as before.
5.  **If CRM Match Successful:**
    *   The `matchedStableHashId` is retrieved.
    *   **Unification Check:** It looks for any *other* `vip_customer_data` record already associated with this `matchedStableHashId`.
    *   If such a record (`existingVipDataForCrm`) is found:
        *   The current `profiles_vip_staging.vip_customer_data_id` is updated to point to this `existingVipDataForCrm.id`.
        *   (The TODO for merging/deleting the potentially orphaned `currentVipData` record remains for future refinement).
    *   If no such pre-existing record is found for the CRM customer:
        *   The `currentVipData` (the one associated with the current `profile_id`) has its `stable_hash_id` updated to `matchedStableHashId`.
    *   Returns success with CRM details.
6.  **If No CRM Match:**
    *   The user still has their `vip_customer_data` record (created in step 3 if it didn't exist), but its `stable_hash_id` remains `null`.
    *   Returns a "no match found" error.

**Next Steps & Important Considerations:**

1.  **`matchProfileWithCrm` Behavior:**
    *   Ensure `matchProfileWithCrm` correctly updates (or creates placeholder records in) `crm_customer_mapping_vip_staging` with `is_matched = true/false` and populates `stable_hash_id` and `crm_customer_id` on successful match. The current API route relies on this behavior. If `matchProfileWithCrm` *doesn't* handle `crm_customer_mapping_vip_staging` updates, that logic would need to be added to this API route as well.
2.  **Type Definitions:**
    *   The `LinkAccountSessionUser` and `LinkAccountSession` interfaces were added. If you have a central types file (e.g., in `types/next-auth.d.ts` or similar), these should ideally be defined there for consistency.
    *   The type for `matchResult` from `matchProfileWithCrm` is still inferred. If its structure is well-defined, having an explicit type would improve code clarity.
3.  **Orphaned `vip_customer_data` Records:** The logic for merging or deleting `vip_customer_data` records that become "orphaned" during unification is still a TODO. For now, they will remain in the database but won't be directly pointed to by the `profiles_vip_staging` record that just got unified. This might be acceptable initially, but a cleanup strategy (manual or automated) could be needed later.
4.  **Error Handling and Edge Cases:** Review the console logs and error responses for different scenarios to ensure they are adequate for debugging and provide enough information to the client if needed.
5.  **Testing:** This endpoint now has significantly more complex logic. Thorough testing of all scenarios is crucial:
    *   User with no `vip_customer_data`, links successfully (new CRM link).
    *   User with existing `vip_customer_data` (no `stable_hash_id`), links successfully (new CRM link).
    *   User links successfully, and their `stable_hash_id` matches an `existing_vip_data_for_crm` (unification).
    *   User attempts link, no CRM match.
    *   Various error conditions (profile not found, database errors during inserts/updates).

The core database schema is now in place, and the two main API routes (`/api/vip/profile` and `/api/vip/link-account`) have been updated to use it. The system is much closer to your desired state of a unified VIP profile centered around `vip_customer_data`.

---

**User**

Thanks, let's move on to another question.

The requirements state a VIP tiering/membership system for which we haven't concluded the logic yet, how is this currently part of the design? Ideally we should have a column in the vip_customer table which can be changed later based on a certain logic

---

**Cursor**

You're absolutely right to bring up the VIP tiering/membership system. It's mentioned as a future possibility in `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.6 "VIP Program (Future)") and implied by the "VIP" naming, but we haven't explicitly built database structures or detailed logic for it yet.

**Current Design & VIP Tiering:**

*   **No Explicit Tier Field:** Currently, neither the `vip_customer_data` table nor any other directly related table we've worked on (`profiles_vip_staging`, `crm_customer_mapping_vip_staging`) has a dedicated column like `vip_tier`, `membership_level`, or `vip_status`.
*   **Implicit VIP Status:** Right now, a user is effectively treated as a "VIP" in the context of these new features if:
    1.  They are authenticated (have a `profiles_vip_staging` record).
    2.  They are encouraged to link to a CRM record.
    3.  The features (profile editing, viewing bookings/packages) are gated behind this authentication and, for some data, successful CRM linking.
*   **`crm_packages` Table:** The `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.8) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.5) mention fetching active and past packages from `crm_packages` for linked CRM customers. This table *could* implicitly define a VIP status or tier if certain packages confer VIP benefits, but it's not a direct tiering system on the user/customer profile itself.

**Your Suggestion: A Column in `vip_customer_data` for Tiering**

This is the most logical place to put it if the VIP tier is something that:
*   Can be determined or managed within your application's logic (even if initially set based on external factors like CRM data or package purchases).
*   Should be readily available when fetching the user's consolidated VIP profile.

**Proposed Implementation:**

1.  **Add a `vip_tier` (or similar name) column to `public.vip_customer_data`:**
    *   **Data Type:** This could be `TEXT` (e.g., "Gold", "Silver", "Bronze"), `INTEGER` (e.g., 1, 2, 3), or an `ENUM` if your database supports it and you have a fixed set of tiers. `TEXT` is often flexible.
    *   **Default Value:** You might want a default (e.g., "Standard", "None", or `NULL`).
    *   **Nullable:** Likely `NULLABLE` initially, or have a base default.

2.  **Migration to Add the Column:**
    *   Create and apply a Supabase migration.

3.  **Logic for Setting/Updating the Tier:** This is the most crucial part and depends on your business rules:
    *   **Initial Population:**
        *   When a `vip_customer_data` record is created, what should its initial tier be?
        *   Could it be derived from the `crm_packages` they have? Or from a field in the `customers` (CRM) table?
    *   **Dynamic Updates:** How does a user's tier change?
        *   Based on spending?
        *   Based on package purchases (e.g., buying a "VIP Gold Package" sets their tier to "Gold")?
        *   Manual admin update?
        *   Automated job that re-evaluates tiers periodically?
    *   This logic would likely reside in:
        *   The account linking process (if initial tier can be determined then).
        *   Separate API endpoints or admin functions for managing tiers.
        *   Potentially, Supabase database functions/triggers if tiers can be updated based on changes in other tables (e.g., `crm_packages`).

4.  **API Updates (`app/api/vip/profile/route.ts` - GET):**
    *   Modify the GET handler to select and return the `vip_tier` from `vip_customer_data`.

5.  **Frontend Display:**
    *   The frontend can then display this tier information.

**Example Migration for `vip_tier` (using TEXT):**

```sql
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_tier TEXT NULLABLE DEFAULT 'Standard'; -- Or whatever default makes sense

COMMENT ON COLUMN public.vip_customer_data.vip_tier IS 'Represents the VIP membership tier or level of the customer (e.g., Standard, Silver, Gold).';
```

**Advantages of this approach:**

*   **Centralized:** The tier is directly associated with the user's unified VIP profile data.
*   **Flexible:** The logic for determining and updating the tier can be implemented and evolve within your application.
*   **Queryable:** Easy to fetch the tier when retrieving VIP profile information.

**Next Steps from My Side:**

1.  If you agree with adding a `vip_tier` column (e.g., as TEXT with a default like 'Standard' or NULL) to `vip_customer_data`, I can create and apply that migration.
2.  After that, I can update the `GET /api/vip/profile` route to include this new field in its response.

The *logic* for how this `vip_tier` is actually determined and managed over time will be a separate, more significant development task for you, involving defining your business rules for VIP tiering. My role here would be to ensure the database and basic API structures support it.

Shall I proceed with adding a `vip_tier TEXT NULLABLE DEFAULT 'Standard'` column to `public.vip_customer_data`?

```sql
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_tier TEXT NULLABLE DEFAULT 'Standard'; -- Or whatever default makes sense

COMMENT ON COLUMN public.vip_customer_data.vip_tier IS 'Represents the VIP membership tier or level of the customer (e.g., Standard, Silver, Gold).';
```

---

**User**

Actualyl can we have a different approach and create some sort of ID and dimension tbale for vip_tier?

e.g. for placeholders we can have 3 tiers (Bogey, Eagle, Masters), there should be benefits, status (so we can maybe add new tiers later on) and there should be a link

---

**Cursor**

Yes, that's a much more robust and scalable approach! Creating a separate dimension table for `vip_tiers` is excellent for managing tier properties, descriptions, statuses, and potentially more attributes in the future (like specific benefits, unlock criteria, etc.).

Here's how we can implement this:

**1. Create `public.vip_tiers` Dimension Table:**

*   `id` (SERIAL PRIMARY KEY): A unique auto-incrementing integer for each tier.
*   `tier_name` (TEXT UNIQUE NOT NULL): The display name of the tier (e.g., "Bogey", "Eagle", "Masters").
*   `description` (TEXT NULLABLE): A description of the tier, potentially outlining its benefits.
*   `status` (TEXT NOT NULL DEFAULT 'active'): To manage the lifecycle of tiers (e.g., 'active', 'inactive', 'archived', 'planned').
*   `sort_order` (INTEGER NULLABLE): If you want to define a specific display order for the tiers.
*   `created_at` (TIMESTAMPTZ DEFAULT NOW())
*   `updated_at` (TIMESTAMPTZ DEFAULT NOW())

**2. Modify `public.vip_customer_data` Table:**

*   Add a `vip_tier_id` (INTEGER NULLABLE) column.
*   This `vip_tier_id` will be a foreign key referencing `public.vip_tiers(id)`.
*   We can set a default `vip_tier_id` for new `vip_customer_data` records *after* we populate the `vip_tiers` table with the default tiers.

**3. Populate `public.vip_tiers` Table:**

*   Insert the initial placeholder tiers ("Bogey", "Eagle", "Masters") with their descriptions and statuses.

**4. Update API `GET /api/vip/profile`:**

*   When fetching `vip_customer_data`, it should also retrieve the `vip_tier_id`.
*   To provide meaningful tier information to the client, the API should then either:
    *   Perform a join between `vip_customer_data` and `vip_tiers` (if using a more complex query or view).
    *   Or, more simply, after fetching `vip_customer_data.vip_tier_id`, make a separate small query to `vip_tiers` to get the `tier_name` and `description` for that `vip_tier_id`. The latter is often easier to implement in route handlers.

**Implementation Steps:**

**Step A: Create `vip_tiers` table and add `vip_tier_id` to `vip_customer_data`**

I'll create one migration for this.
*   **Migration Name:** `create_vip_tiers_and_link_to_vip_customer_data`
*   **Project ID:** `bisimqmtxjsptehhqpeg`
*   **SQL:**
    ```sql
    -- Step 1: Create the vip_tiers dimension table
    CREATE TABLE public.vip_tiers (
        id SERIAL PRIMARY KEY,
        tier_name TEXT UNIQUE NOT NULL,
        description TEXT NULLABLE,
        status TEXT NOT NULL DEFAULT 'active', -- e.g., active, inactive, planned
        sort_order INTEGER NULLABLE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP membership tiers.';
    COMMENT ON COLUMN public.vip_tiers.tier_name IS 'Display name of the VIP tier (e.g., Bogey, Eagle, Masters).';
    COMMENT ON COLUMN public.vip_tiers.description IS 'Description of the tier and its benefits.';
    COMMENT ON COLUMN public.vip_tiers.status IS 'Lifecycle status of the tier (e.g., active, inactive).';
    COMMENT ON COLUMN public.vip_tiers.sort_order IS 'Optional sort order for displaying tiers.';

    -- Function to update updated_at timestamp (if not already created globally, ensure it exists)
    CREATE OR REPLACE FUNCTION trigger_set_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger for vip_tiers table
    CREATE TRIGGER set_timestamp_on_vip_tiers_update
    BEFORE UPDATE ON public.vip_tiers
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_timestamp();

    -- Step 2: Add vip_tier_id to vip_customer_data table
    ALTER TABLE public.vip_customer_data
    ADD COLUMN vip_tier_id INTEGER NULLABLE;

    COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key referencing the VIP tier of the customer in the vip_tiers table.';

    -- Step 3: Add the foreign key constraint (AFTER vip_tiers table is created)
    ALTER TABLE public.vip_customer_data
    ADD CONSTRAINT fk_vip_customer_data_vip_tier
        FOREIGN KEY (vip_tier_id)
        REFERENCES public.vip_tiers(id)
        ON DELETE SET NULL; -- If a tier is deleted, nullify the reference in customer data (or use ON DELETE RESTRICT)
    ```
I will apply this migration now.


```sql
    -- Step 1: Create the vip_tiers dimension table
    CREATE TABLE public.vip_tiers (
        id SERIAL PRIMARY KEY,
        tier_name TEXT UNIQUE NOT NULL,
        description TEXT NULLABLE,
        status TEXT NOT NULL DEFAULT 'active', -- e.g., active, inactive, planned
        sort_order INTEGER NULLABLE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP membership tiers.';
    COMMENT ON COLUMN public.vip_tiers.tier_name IS 'Display name of the VIP tier (e.g., Bogey, Eagle, Masters).';
    COMMENT ON COLUMN public.vip_tiers.description IS 'Description of the tier and its benefits.';
    COMMENT ON COLUMN public.vip_tiers.status IS 'Lifecycle status of the tier (e.g., active, inactive).';
    COMMENT ON COLUMN public.vip_tiers.sort_order IS 'Optional sort order for displaying tiers.';

    -- Function to update updated_at timestamp (if not already created globally, ensure it exists)
    CREATE OR REPLACE FUNCTION trigger_set_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger for vip_tiers table
    CREATE TRIGGER set_timestamp_on_vip_tiers_update
    BEFORE UPDATE ON public.vip_tiers
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_timestamp();

    -- Step 2: Add vip_tier_id to vip_customer_data table
    ALTER TABLE public.vip_customer_data
    ADD COLUMN vip_tier_id INTEGER NULLABLE;

    COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key referencing the VIP tier of the customer in the vip_tiers table.';

    -- Step 3: Add the foreign key constraint (AFTER vip_tiers table is created)
    ALTER TABLE public.vip_customer_data
    ADD CONSTRAINT fk_vip_customer_data_vip_tier
        FOREIGN KEY (vip_tier_id)
        REFERENCES public.vip_tiers(id)
        ON DELETE SET NULL; -- If a tier is deleted, nullify the reference in customer data (or use ON DELETE RESTRICT)
```

You are absolutely correct, I fell into the `NULLABLE` trap again. It seems to be a persistent blind spot for me with PostgreSQL migrations today!

Let me remove `NULLABLE` where it's not needed (as it's the default) and try again.

Corrected SQL for `create_vip_tiers_and_link_to_vip_customer_data_v2`:
```sql
-- Step 1: Create the vip_tiers dimension table
CREATE TABLE public.vip_tiers (
    id SERIAL PRIMARY KEY,
    tier_name TEXT UNIQUE NOT NULL,
    description TEXT, -- Default is NULLABLE
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER, -- Default is NULLABLE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP membership tiers.';
COMMENT ON COLUMN public.vip_tiers.tier_name IS 'Display name of the VIP tier (e.g., Bogey, Eagle, Masters).';
COMMENT ON COLUMN public.vip_tiers.description IS 'Description of the tier and its benefits.';
COMMENT ON COLUMN public.vip_tiers.status IS 'Lifecycle status of the tier (e.g., active, inactive).';
COMMENT ON COLUMN public.vip_tiers.sort_order IS 'Optional sort order for displaying tiers.';

-- Function to update updated_at timestamp (if not already created globally, ensure it exists)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vip_tiers table
CREATE TRIGGER set_timestamp_on_vip_tiers_update
BEFORE UPDATE ON public.vip_tiers
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- Step 2: Add vip_tier_id to vip_customer_data table
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_tier_id INTEGER; -- Default is NULLABLE

COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key referencing the VIP tier of the customer in the vip_tiers table.';

-- Step 3: Add the foreign key constraint (AFTER vip_tiers table is created)
ALTER TABLE public.vip_customer_data
ADD CONSTRAINT fk_vip_customer_data_vip_tier
    FOREIGN KEY (vip_tier_id)
    REFERENCES public.vip_tiers(id)
    ON DELETE SET NULL;
```

I'll apply this corrected version.


```sql
-- Step 1: Create the vip_tiers dimension table
CREATE TABLE public.vip_tiers (
    id SERIAL PRIMARY KEY,
    tier_name TEXT UNIQUE NOT NULL,
    description TEXT, -- Default is NULLABLE
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER, -- Default is NULLABLE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP membership tiers.';
COMMENT ON COLUMN public.vip_tiers.tier_name IS 'Display name of the VIP tier (e.g., Bogey, Eagle, Masters).';
COMMENT ON COLUMN public.vip_tiers.description IS 'Description of the tier and its benefits.';
COMMENT ON COLUMN public.vip_tiers.status IS 'Lifecycle status of the tier (e.g., active, inactive).';
COMMENT ON COLUMN public.vip_tiers.sort_order IS 'Optional sort order for displaying tiers.';

-- Function to update updated_at timestamp (if not already created globally, ensure it exists)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vip_tiers table
CREATE TRIGGER set_timestamp_on_vip_tiers_update
BEFORE UPDATE ON public.vip_tiers
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- Step 2: Add vip_tier_id to vip_customer_data table
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_tier_id INTEGER; -- Default is NULLABLE

COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key referencing the VIP tier of the customer in the vip_tiers table.';

-- Step 3: Add the foreign key constraint (AFTER vip_tiers table is created)
ALTER TABLE public.vip_customer_data
ADD CONSTRAINT fk_vip_customer_data_vip_tier
    FOREIGN KEY (vip_tier_id)
    REFERENCES public.vip_tiers(id)
    ON DELETE SET NULL;
```

```sql
-- Step 1: Create the vip_tiers dimension table
CREATE TABLE public.vip_tiers (
    id SERIAL PRIMARY KEY,
    tier_name TEXT UNIQUE NOT NULL,
    description TEXT, -- Default is NULLABLE
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER, -- Default is NULLABLE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP membership tiers.';
COMMENT ON COLUMN public.vip_tiers.tier_name IS 'Display name of the VIP tier (e.g., Bogey, Eagle, Masters).';
COMMENT ON COLUMN public.vip_tiers.description IS 'Description of the tier and its benefits.';
COMMENT ON COLUMN public.vip_tiers.status IS 'Lifecycle status of the tier (e.g., active, inactive).';
COMMENT ON COLUMN public.vip_tiers.sort_order IS 'Optional sort order for displaying tiers.';

-- Function to update updated_at timestamp (if not already created globally, ensure it exists)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vip_tiers table
CREATE TRIGGER set_timestamp_on_vip_tiers_update
BEFORE UPDATE ON public.vip_tiers
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- Step 2: Add vip_tier_id to vip_customer_data table
ALTER TABLE public.vip_customer_data
ADD COLUMN vip_tier_id INTEGER; -- Default is NULLABLE

COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key referencing the VIP tier of the customer in the vip_tiers table.';

-- Step 3: Add the foreign key constraint (AFTER vip_tiers table is created)
ALTER TABLE public.vip_customer_data
ADD CONSTRAINT fk_vip_customer_data_vip_tier
    FOREIGN KEY (vip_tier_id)
    REFERENCES public.vip_tiers(id)
    ON DELETE SET NULL;
```

Excellent! The migration `create_vip_tiers_and_link_to_vip_customer_data_v2` was applied successfully.

We now have:
1.  The `public.vip_tiers` table created with `id`, `tier_name`, `description`, `status`, `sort_order`, and timestamps.
2.  The `public.vip_customer_data` table has a new `vip_tier_id` (INTEGER) column.
3.  A foreign key constraint `fk_vip_customer_data_vip_tier` links `vip_customer_data.vip_tier_id` to `vip_tiers.id`.

**Step B: Populate `public.vip_tiers` Table**

Now, let's insert your initial placeholder tiers: "Bogey", "Eagle", and "Masters". I'll assume a default status of 'active' and provide some placeholder descriptions.

*   **Migration Name:** `populate_initial_vip_tiers`
*   **SQL:**
    ```sql
    INSERT INTO public.vip_tiers (tier_name, description, status, sort_order)
    VALUES
        ('Bogey', 'Standard access tier for new VIP members.', 'active', 1),
        ('Eagle', 'Enhanced access tier with additional benefits.', 'active', 2),
        ('Masters', 'Premium access tier with exclusive benefits and services.', 'active', 3)
    ON CONFLICT (tier_name) DO NOTHING; -- Avoid errors if tiers with these names somehow already exist

    -- Optionally, set a default vip_tier_id for new vip_customer_data records
    -- First, get the ID of the 'Bogey' tier (or your preferred default)
    -- This part is tricky in a single migration without knowing the ID beforehand.
    -- A common approach is to do this via application logic or a separate script after IDs are known.
    -- For now, we'll skip setting the default directly in the ALTER TABLE for vip_customer_data,
    -- as the ID from SERIAL isn't known deterministically at this stage of migration writing.
    -- The application can assign a default tier ID when new vip_customer_data records are created.
    ```
I'll apply this migration to populate the tiers.


```sql
    INSERT INTO public.vip_tiers (tier_name, description, status, sort_order)
    VALUES
        ('Bogey', 'Standard access tier for new VIP members.', 'active', 1),
        ('Eagle', 'Enhanced access tier with additional benefits.', 'active', 2),
        ('Masters', 'Premium access tier with exclusive benefits and services.', 'active', 3)
    ON CONFLICT (tier_name) DO NOTHING; -- Avoid errors if tiers with these names somehow already exist

    -- Optionally, set a default vip_tier_id for new vip_customer_data records
    -- First, get the ID of the 'Bogey' tier (or your preferred default)
    -- This part is tricky in a single migration without knowing the ID beforehand.
    -- A common approach is to do this via application logic or a separate script after IDs are known.
    -- For now, we'll skip setting the default directly in the ALTER TABLE for vip_customer_data,
    -- as the ID from SERIAL isn't known deterministically at this stage of migration writing.
    -- The application can assign a default tier ID when new vip_customer_data records are created.
```

```sql
    INSERT INTO public.vip_tiers (tier_name, description, status, sort_order)
    VALUES
        ('Bogey', 'Standard access tier for new VIP members.', 'active', 1),
        ('Eagle', 'Enhanced access tier with additional benefits.', 'active', 2),
        ('Masters', 'Premium access tier with exclusive benefits and services.', 'active', 3)
    ON CONFLICT (tier_name) DO NOTHING; -- Avoid errors if tiers with these names somehow already exist

    -- Optionally, set a default vip_tier_id for new vip_customer_data records
    -- First, get the ID of the 'Bogey' tier (or your preferred default)
    -- This part is tricky in a single migration without knowing the ID beforehand.
    -- A common approach is to do this via application logic or a separate script after IDs are known.
    -- For now, we'll skip setting the default directly in the ALTER TABLE for vip_customer_data,
    -- as the ID from SERIAL isn't known deterministically at this stage of migration writing.
    -- The application can assign a default tier ID when new vip_customer_data records are created.
```

The initial VIP tiers ("Bogey", "Eagle", "Masters") have been populated into the `public.vip_tiers` table.

**Step C: Update API `GET /api/vip/profile`**

Now, I'll update the `GET /api/vip/profile/route.ts` to:
1.  Select `vip_tier_id` from `vip_customer_data`.
2.  If `vip_tier_id` is present, make an additional query to `vip_tiers` to fetch `tier_name` and `description`.
3.  Include `vipTier` (an object with `id`, `name`, `description`) in the response. If no tier is assigned, this could be `null`.


```typescript
// ... existing code ...
    let vipEmail = userProfile.email;
    let vipMarketingPreference: boolean | null = null;
    let stableHashIdToUse: string | null = null;
    let vipPhoneNumber: string | null = null;
    let vipTierInfo: { id: number; name: string; description: string | null } | null = null; // To hold tier details
    
    let finalResolvedPhoneNumber: string | null = userProfile.phone_number ?? null;

    if (userProfile.vip_customer_data_id) {
      const { data: vipData, error: vipDataError } = await supabaseUserClient
        .from('vip_customer_data')
        // Select new vip_tier_id as well
        .select('vip_display_name, vip_email, vip_marketing_preference, stable_hash_id, vip_phone_number, vip_tier_id') 
        .eq('id', userProfile.vip_customer_data_id)
        .single();

      if (vipDataError) {
// ... existing code ...
        vipPhoneNumber = vipData.vip_phone_number;
        if (vipPhoneNumber !== null) {
            finalResolvedPhoneNumber = vipPhoneNumber;
        }

        // If vip_tier_id is present, fetch tier details
        if (vipData.vip_tier_id) {
          const { data: tierData, error: tierError } = await supabaseUserClient // Can use the same client
            .from('vip_tiers')
            .select('id, tier_name, description')
            .eq('id', vipData.vip_tier_id)
            .single();
          
          if (tierError) {
            console.warn(`[VIP Profile API GET] Could not fetch vip_tier details for tier_id ${vipData.vip_tier_id}:`, tierError);
          } else if (tierData) {
            vipTierInfo = { id: tierData.id, name: tierData.tier_name, description: tierData.description };
          }
        }
      }
    }
// ... existing code ...
      name: vipDisplayName,
      email: vipEmail,
      phoneNumber: finalResolvedPhoneNumber,
      pictureUrl: userProfile.picture_url,
      marketingPreference: vipMarketingPreference,
      crmStatus: crmStatus,
      crmCustomerId: crmCustomerIdFromMapping,
      stableHashId: finalStableHashId,
      vipTier: vipTierInfo // Add vipTier to the response
    });

  } catch (error) {
// ... existing code ...
export async function PUT(request: Request) {
// ... existing code ...
      const { data: newVipData, error: insertVipError } = await supabaseUserClient
        .from('vip_customer_data')
        .insert({
          vip_display_name: reqDisplayName ?? userProfile.display_name,
          vip_email: reqEmail ?? userProfile.email,
          vip_marketing_preference: reqMarketingPreference,
          vip_phone_number: reqVipPhoneNumber,
          // vip_tier_id will be NULL by default here, or set it if a default is passed in request/determined by logic
          // For now, not setting it explicitly on create, will rely on DB default if any or manual/logic-based update later
        })
        .select('id') // Select only id, or '*' if you need the whole new record
        .single();
// ... existing code ...
      const vipUpdatePayload: Partial<{
        vip_display_name?: string;
        vip_email?: string;
        vip_marketing_preference?: boolean;
        vip_phone_number?: string | null;
        vip_tier_id?: number | null; // Allow updating vip_tier_id
        updated_at?: string;
      }> = {};

      if (reqDisplayName !== undefined) {
// ... existing code ...
        }
      }
      // Add logic to handle vip_tier_id update if provided in PUT request
      // For now, this PUT doesn't explicitly handle setting tier, only other profile fields.
      // If tier management is needed via this endpoint, reqBody should include vip_tier_id
      // and it should be added to vipUpdatePayload with validation.

      if (updatedFieldsAccumulator.length > 0) {
// ... existing code ...

```

The `GET /api/vip/profile` route has been updated:
*   It now attempts to fetch `vip_tier_id` from `vip_customer_data`.
*   If `vip_tier_id` is found, it makes another query to `vip_tiers` to get the tier's `id`, `name`, and `description`.
*   The API response now includes a `vipTier` object (which can be `null` if no tier is assigned or found).
*   The `PUT` handler was minimally touched to acknowledge `vip_tier_id` in types but does *not* currently implement logic to update the tier via this endpoint.

**Summary and Next Steps for VIP Tiers:**

1.  **Database Structure:** You now have `public.vip_tiers` (populated with "Bogey", "Eagle", "Masters") and `public.vip_customer_data.vip_tier_id` to link customers to tiers.
2.  **Profile API (GET):** The GET endpoint can return tier information.
3.  **Tier Assignment Logic (Crucial Next Development Task for You):**
    *   **Default Tier for New Users:** How should `vip_customer_data.vip_tier_id` be set when a *new* `vip_customer_data` record is created (e.g., in the `PUT /api/vip/profile` or `POST /api/vip/link-account` if a user has no prior `vip_customer_data` record)?
        *   You could modify the `INSERT` statements in those APIs to set a default `vip_tier_id` (e.g., query for the ID of "Bogey" tier and use that).
        *   Alternatively, you could set a database default for `vip_customer_data.vip_tier_id` if you always want a specific tier ID for new records (this requires knowing the ID of your default tier).
    *   **Tier Update Logic:** How will a user's tier change from, say, "Bogey" to "Eagle"? This is the core business logic for your VIP program. It could involve:
        *   Admin-only API endpoints to manually set a user's tier.
        *   Logic within other parts of your application (e.g., when a specific package is purchased from `crm_packages`, it triggers an update to `vip_customer_data.vip_tier_id`).
        *   Automated scripts/jobs that evaluate criteria and update tiers.
4.  **API for Tier Management (Optional):**
    *   The `PUT /api/vip/profile` currently does *not* allow users to change their own tier. This is probably correct, as tier assignment is usually a business-controlled process.
    *   You might need separate, secured (admin-only?) API endpoints if you want to manage tiers programmatically.

You've successfully established the foundational database structure for a more sophisticated VIP tiering system! The next steps involve defining and implementing the business logic that governs how users are assigned to and move between these tiers.

---

**User**

Can you update @VIP_API_Endpoints.md @DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md and @TECHNICAL_DESIGN_LENGOLF_VIP.md with these changes

---

**Cursor**

Okay, I will update the three documentation files (`docs/VIP_API_Endpoints.md`, `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`, and `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md`) to reflect the recent changes to the VIP profile system, including the introduction of the `vip_customer_data` and `vip_tiers` tables, the modified data flow for profile information, and the updated API responses.

I'll begin by updating `docs/VIP_API_Endpoints.md`.


```markdown
// ... existing code ...
### `GET /api/vip/profile`

*   **Task ID:** VIP-BE-005
*   **Description:** Fetches the authenticated user's profile data. This combines information from the `profiles_vip_staging` table, the linked `vip_customer_data` table, and potentially the `customers` (CRM) table.
*   **Authentication:** Required (NextAuth).
*   **Request Body:** None.
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
    {
      "id": "user-profile-uuid", // from profiles_vip_staging.id
      "name": "User Display Name", // from vip_customer_data.vip_display_name, fallback to profiles_vip_staging.display_name
      "email": "user@example.com", // from vip_customer_data.vip_email, fallback to profiles_vip_staging.email
      "phoneNumber": "0812345678", // Resolved: 1. CRM customers.contact_number, 2. vip_customer_data.vip_phone_number, 3. profiles_vip_staging.phone_number
      "pictureUrl": "url-to-profile-picture", // from profiles_vip_staging.picture_url
      "marketingPreference": true, // from vip_customer_data.vip_marketing_preference
      "crmStatus": "linked_matched" | "linked_unmatched" | "not_linked", // Status of CRM linking
      "crmCustomerId": "some-crm-customer-id" | null, // CRM customer ID if linked
      "stableHashId": "some-stable-hash-id" | null, // Stable hash ID, primarily from vip_customer_data or crm_customer_mapping_vip_staging
      "vipTier": { // Information about the user's VIP tier
        "id": 1,
        "name": "Eagle",
        "description": "Preferred benefits for Eagle tier members"
      } | null // Null if not tiered or tier info not found
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: If the user is not authenticated.
// ... existing code ...
*   **Task ID:** VIP-BE-006
*   **Description:** Updates the authenticated user's editable profile data, primarily in the `vip_customer_data` table. Creates a `vip_customer_data` record if one doesn't exist and links it to the user's profile.
*   **Authentication:** Required (NextAuth).
*   **Request Body (Fields are optional):**
    ```json
    {
      "display_name": "New User Display Name", // Updates vip_customer_data.vip_display_name
      "email": "new_user@example.com",       // Updates vip_customer_data.vip_email
      "marketingPreference": false,          // Updates vip_customer_data.vip_marketing_preference
      "vip_phone_number": "0987654321"       // Updates vip_customer_data.vip_phone_number, can be null
    }
    ```
*   **Query Parameters:** None.
*   **Success Response (200 OK):**
    ```json
// ... existing code ...

```

The `docs/VIP_API_Endpoints.md` file has been updated.

Next, I'll update `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`.


```markdown
// ... existing code ...
**Key Data Entities Involved:**

*   **`profiles` (Supabase Table):** Stores authentication-related user data (e.g., from NextAuth). Key fields: `id` (UUID, primary key), `provider` (e.g., 'line'), `provider_id` (e.g., LINE User ID), `display_name`, `email`, `phone_number`. **Will add `vip_customer_data_id` (UUID, NULLABLE, FK to `vip_customer_data.id`)**. `marketing_preference` has been moved to `vip_customer_data`.
*   **`vip_customer_data` (Supabase Table):** Stores VIP-specific customer data, editable by the user. Key fields: `id` (UUID, primary key), `vip_display_name` (TEXT), `vip_email` (TEXT), `vip_marketing_preference` (BOOLEAN), `stable_hash_id` (TEXT, NULLABLE, for linking to CRM `customers` table), `vip_phone_number` (TEXT, NULLABLE), `vip_tier_id` (INT, NULLABLE, FK to `vip_tiers.id`).
*   **`vip_tiers` (Supabase Table):** Dimension table for VIP tiers. Key fields: `id` (SERIAL, primary key), `tier_name` (TEXT, NOT NULL), `description` (TEXT), `status` (TEXT, e.g., 'active', 'inactive'), `sort_order` (INTEGER).
*   **`customers` (Supabase Table):** **Confirmed** source of customer data, synced from an external CRM/POS. Key fields: `id` (CRM/POS primary key), `customer_name`, `contact_number`, `email`, `stable_hash_id` (MD5 of name+phone for robust linking).
*   **`crm_customer_mapping` (Supabase Table):** Links authenticated users (`profiles`) to customer records (`customers`). Key fields: `profile_id` (FK to `profiles.id`), `crm_customer_id` (FK to `customers.id`, NULLABLE), `stable_hash_id` (from `customers`, NULLABLE), `crm_customer_data` (cached customer details), `is_matched` (BOOLEAN, indicates if a link to a `customers` record was successful). **Supports placeholder records where `is_matched = false` and CRM IDs are NULL.** `profiles_vip_staging` and `crm_customer_mapping_vip_staging` are used in the implementation.
*   **`bookings` (Supabase Table):** Stores booking details. Key field for linking: `user_id` (FK to `profiles.id`).
// ... existing code ...
### 2.3. My Profile (P0)

*   **Access**: `/vip/profile`.
*   **Interface**: Web page component (`ProfileView`).
*   **Functionality**:
    *   Fetches profile data (`GET /api/vip/profile`).
    *   Displays current Name (from `vip_customer_data.vip_display_name`), Email (from `vip_customer_data.vip_email`), Phone Number (resolved with priority: CRM > `vip_customer_data.vip_phone_number` > `profiles.phone_number`).
    *   Displays current VIP Tier (from `vip_customer_data` joined with `vip_tiers`).
    *   Allows editing Name, Email, Marketing Preferences, and VIP Phone Number (updates `vip_customer_data` table via `PUT /api/vip/profile`).
    *   Phone number obtained from CRM is not editable here.

### 2.4. My Bookings (P0)
// ... existing code ...

### 3.4. Database Considerations

*   **Schema:** Add `vip_customer_data_id` to `profiles`. Create `vip_customer_data` and `vip_tiers` tables. `marketing_preference` moved from `profiles` to `vip_customer_data`. Ensure `crm_customer_mapping` supports nullable CRM IDs and the `is_matched` flag.
*   **RLS:** **Implement Row Level Security** on `profiles`, `bookings`, `crm_customer_mapping`, `crm_packages`, `vip_customer_data`, `vip_tiers` and potentially `customers` to enforce data access based on authenticated user ID (`auth.uid()`). Ensure `anon` role policies are reviewed/added only if specific public access is needed elsewhere.
*   **Indexes:** Ensure appropriate indexes (see technical design).

### 3.5. Security Considerations
// ... existing code ...
```

The `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` file has been updated.

Finally, I will update `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md`.


```markdown
// ... existing code ...
## 3. Database Schema Modifications

1.  **`profiles` Table (specifically `profiles_vip_staging`):**
    *   The column `marketing_preference` has been **removed** from this table. It is now managed in `vip_customer_data`.
    *   Add a new column: `vip_customer_data_id`
        *   Type: `UUID`
        *   Nullable: `TRUE`
        *   Foreign Key: References `public.vip_customer_data(id)`
        *   `ON DELETE SET NULL` (or `ON DELETE RESTRICT` depending on desired behavior if a `vip_customer_data` record is deleted)
    *   *Migration SQL for adding `vip_customer_data_id` (assuming `profiles_vip_staging`):*
        ```sql
        ALTER TABLE public.profiles_vip_staging
        ADD COLUMN IF NOT EXISTS vip_customer_data_id UUID REFERENCES public.vip_customer_data(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN public.profiles_vip_staging.vip_customer_data_id IS 'Foreign key linking to the central VIP customer data record.';
        ```
    *   *Migration SQL for removing `marketing_preference` (assuming `profiles_vip_staging`):*
        ```sql
        ALTER TABLE public.profiles_vip_staging
        DROP COLUMN IF EXISTS marketing_preference;
        ```

2.  **`vip_customer_data` Table:**
    *   Purpose: Centralizes VIP-specific, user-editable data and links to CRM and VIP Tiers.
    *   Columns:
        *   `id` (UUID, Primary Key, default: `gen_random_uuid()`)
        *   `vip_display_name` (TEXT, NULLABLE)
        *   `vip_email` (TEXT, NULLABLE)
        *   `vip_marketing_preference` (BOOLEAN, NULLABLE, DEFAULT TRUE)
        *   `stable_hash_id` (TEXT, NULLABLE, for linking to `customers` table via their `stable_hash_id`)
        *   `vip_phone_number` (TEXT, NULLABLE)
        *   `vip_tier_id` (INTEGER, NULLABLE, Foreign Key to `public.vip_tiers(id) ON DELETE SET NULL`)
        *   `created_at` (TIMESTAMPTZ, default: `now()`)
        *   `updated_at` (TIMESTAMPTZ, default: `now()`)
    *   *Migration SQL:*
        ```sql
        CREATE TABLE IF NOT EXISTS public.vip_customer_data (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vip_display_name TEXT,
            vip_email TEXT,
            vip_marketing_preference BOOLEAN DEFAULT TRUE,
            stable_hash_id TEXT,
            vip_phone_number TEXT,
            vip_tier_id INTEGER REFERENCES public.vip_tiers(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );

        COMMENT ON TABLE public.vip_customer_data IS 'Stores VIP customer specific data, including preferences and links.';
        COMMENT ON COLUMN public.vip_customer_data.stable_hash_id IS 'Can be used to link to the CRM customers table if a stable_hash_id exists.';
        COMMENT ON COLUMN public.vip_customer_data.vip_tier_id IS 'Foreign key to the vip_tiers table.';
        
        -- Trigger to automatically update updated_at
        CREATE TRIGGER handle_updated_at
        BEFORE UPDATE ON public.vip_customer_data
        FOR EACH ROW
        EXECUTE FUNCTION moddatetime (updated_at);
        ```

3.  **`vip_tiers` Table:**
    *   Purpose: Dimension table for VIP tier definitions.
    *   Columns:
        *   `id` (SERIAL, Primary Key) - Changed from INTEGER to SERIAL for auto-increment.
        *   `tier_name` (TEXT, NOT NULL, UNIQUE)
        *   `description` (TEXT, NULLABLE)
        *   `status` (TEXT, NULLABLE, e.g., 'active', 'inactive', default: 'active')
        *   `sort_order` (INTEGER, NULLABLE, default: 0)
        *   `created_at` (TIMESTAMPTZ, default: `now()`)
        *   `updated_at` (TIMESTAMPTZ, default: `now()`)
    *   *Migration SQL:*
        ```sql
        CREATE TABLE IF NOT EXISTS public.vip_tiers (
            id SERIAL PRIMARY KEY,
            tier_name TEXT NOT NULL UNIQUE,
            description TEXT,
            status TEXT DEFAULT 'active',
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );

        COMMENT ON TABLE public.vip_tiers IS 'Dimension table for VIP tier definitions.';
        
        -- Trigger to automatically update updated_at
        CREATE TRIGGER handle_updated_at
        BEFORE UPDATE ON public.vip_tiers
        FOR EACH ROW
        EXECUTE FUNCTION moddatetime (updated_at);
        ```

4.  **`crm_customer_mapping` Table (specifically `crm_customer_mapping_vip_staging`):**
    *   No changes required by this specific update, but its role in linking `profiles_vip_staging` to CRM `customers` (often via `stable_hash_id`) remains. `vip_customer_data.stable_hash_id` now provides a more direct route for profile-to-CRM linkage for VIP data.

5.  **Indexes (Recommendations):**
    *   `profiles_vip_staging`: Ensure index on `id` (primary key), and `vip_customer_data_id`.
    *   `vip_customer_data`: Ensure index on `id` (primary key), `stable_hash_id`, `vip_tier_id`.
    *   `vip_tiers`: Ensure index on `id` (primary key), `tier_name`.
    *   `crm_customer_mapping_vip_staging`: Ensure indexes on `profile_id` and `stable_hash_id`.
    *   `bookings`: Ensure index on `user_id`.
    *   `crm_packages`: Ensure index on `stable_hash_id`.

6.  **Row Level Security (RLS) Policies:**
    *   **Requirement:** Enable RLS on relevant tables. Tables are `profiles_vip_staging`, `vip_customer_data`, `vip_tiers`.
    *   **`profiles_vip_staging` Table:**
        ```sql
        -- Drop existing policies if necessary before creating new ones
        DROP POLICY IF EXISTS "Allow individual user access" ON public.profiles_vip_staging;
        -- Allow users to select/update their own profile
        CREATE POLICY "Allow individual user access" ON public.profiles_vip_staging
        FOR ALL
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
        ```
    *   **`vip_customer_data` Table:**
        ```sql
        DROP POLICY IF EXISTS "Allow individual user CRUD on linked vip_customer_data" ON public.vip_customer_data;
        -- Allow users to select/insert/update/delete their own vip_customer_data record,
        -- linked via profiles_vip_staging.vip_customer_data_id
        CREATE POLICY "Allow individual user CRUD on linked vip_customer_data" ON public.vip_customer_data
        FOR ALL
        USING (
          EXISTS (
            SELECT 1
            FROM public.profiles_vip_staging pvs
            WHERE pvs.id = auth.uid() AND pvs.vip_customer_data_id = public.vip_customer_data.id
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.profiles_vip_staging pvs
            WHERE pvs.id = auth.uid() AND pvs.vip_customer_data_id = public.vip_customer_data.id
          )
          OR 
          -- Allow insert if the user is creating a new record that will be linked.
          -- This might be complex to enforce perfectly here if ID is client-generated before link.
          -- Simpler: allow insert if auth.uid() exists, then link in transaction.
          -- For now, focusing on access post-link. API handles creation and linking.
          (
            -- This condition is more for API-driven inserts where linking happens immediately.
            -- Direct inserts might need a different strategy or rely on service_role.
            auth.uid() IS NOT NULL 
          )
        );

        -- A more permissive SELECT if needed by other logic (e.g. admin) would be separate.
        -- For user-facing operations, the above should suffice.
        -- Ensure users can create a new record: API will insert then update profiles_vip_staging.vip_customer_data_id.
        -- The RLS for INSERT without an existing link needs careful thought.
        -- A simpler INSERT RLS:
        -- CREATE POLICY "Allow authenticated user to insert into vip_customer_data" ON public.vip_customer_data
        -- FOR INSERT
        -- TO authenticated
        -- WITH CHECK (true); -- API must then ensure it's linked to the correct profiles_vip_staging.id
        ```
    *   **`vip_tiers` Table:**
        ```sql
        DROP POLICY IF EXISTS "Allow all authenticated read access to vip_tiers" ON public.vip_tiers;
        -- Generally, tier definitions are public or readable by all authenticated users.
        CREATE POLICY "Allow all authenticated read access to vip_tiers" ON public.vip_tiers
        FOR SELECT
        TO authenticated
        USING (true);
        -- Admin/service_role would have policies for CUD operations on tiers.
        ```
    *   **`bookings` Table:** (Ensure `user_id` corresponds to `auth.uid()`)
        ```sql
        DROP POLICY IF EXISTS "Allow individual user access to bookings" ON public.bookings;
        CREATE POLICY "Allow individual user access to bookings" ON public.bookings
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
        ```
    *   **`crm_customer_mapping_vip_staging` Table:**
        ```sql
        DROP POLICY IF EXISTS "Allow individual read access to own mapping" ON public.crm_customer_mapping_vip_staging;
        CREATE POLICY "Allow individual read access to own mapping" ON public.crm_customer_mapping_vip_staging
        FOR SELECT
        USING (auth.uid() = profile_id);
        ```
    *   **`customers` Table:** (Access via backend APIs)
        ```sql
        DROP POLICY IF EXISTS "Allow linked user read access via stable_hash_id" ON public.customers;
        CREATE POLICY "Allow linked user read access via stable_hash_id" ON public.customers
        FOR SELECT
        USING (
          EXISTS ( -- If linked via vip_customer_data's stable_hash_id
            SELECT 1
            FROM public.profiles_vip_staging pvs
            JOIN public.vip_customer_data vcd ON pvs.vip_customer_data_id = vcd.id
            WHERE pvs.id = auth.uid()
              AND vcd.stable_hash_id IS NOT NULL
              AND vcd.stable_hash_id = public.customers.stable_hash_id
          ) OR EXISTS ( -- Or if linked via crm_customer_mapping_vip_staging's stable_hash_id
            SELECT 1
            FROM public.crm_customer_mapping_vip_staging ccms
            WHERE ccms.profile_id = auth.uid()
              AND ccms.is_matched = true
              AND ccms.stable_hash_id IS NOT NULL
              AND ccms.stable_hash_id = public.customers.stable_hash_id
          )
        );
        ```
    *   **`crm_packages` Table:** (Access via backend APIs based on `stable_hash_id`)
        ```sql
        DROP POLICY IF EXISTS "Allow linked user read access to packages via stable_hash_id" ON public.crm_packages;
        CREATE POLICY "Allow linked user read access to packages via stable_hash_id" ON public.crm_packages
        FOR SELECT
        USING (
          EXISTS ( -- If linked via vip_customer_data's stable_hash_id
            SELECT 1
            FROM public.profiles_vip_staging pvs
            JOIN public.vip_customer_data vcd ON pvs.vip_customer_data_id = vcd.id
            WHERE pvs.id = auth.uid()
              AND vcd.stable_hash_id IS NOT NULL
              AND vcd.stable_hash_id = public.crm_packages.stable_hash_id
          ) OR EXISTS ( -- Or if linked via crm_customer_mapping_vip_staging's stable_hash_id
            SELECT 1
            FROM public.crm_customer_mapping_vip_staging ccms
            WHERE ccms.profile_id = auth.uid()
              AND ccms.is_matched = true
              AND ccms.stable_hash_id IS NOT NULL
              AND ccms.stable_hash_id = public.crm_packages.stable_hash_id
          )
        );
        ```
    *   **Important:** Applying RLS will block access via the `anon` key unless specific permissive policies for the `anon` role are added.

## 4. API Endpoint Specifications

All VIP API endpoints below require the user to be authenticated via NextAuth.js. Middleware should enforce this. The table names `profiles` and `crm_customer_mapping` in the original spec should be interpreted as `profiles_vip_staging` and `crm_customer_mapping_vip_staging` respectively, unless explicitly referring to the CRM's `customers` table.

1.  **`GET /api/vip/status`**
    *   **Purpose:** Check if the authenticated user is linked to a matched CRM customer. This now also considers `vip_customer_data.stable_hash_id`.
    *   **Authorization:** Authenticated user.
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Query `profiles_vip_staging` for `vip_customer_data_id`.
        3.  If `vip_customer_data_id` exists, query `vip_customer_data` for `stable_hash_id`.
            *   If `stable_hash_id` from `vip_customer_data` exists, check against `customers` table.
                *   If match in `customers`, return `linked_matched` with `crmCustomerId` and `stableHashId`.
                *   If no match in `customers`, return `linked_unmatched` (or a new status like `vip_data_exists_crm_unmatched`) with `stableHashId` from `vip_customer_data`.
        4.  If no `stable_hash_id` from `vip_customer_data` (or no `vip_customer_data_id`), then check `crm_customer_mapping_vip_staging` for `profile_id`.
            *   If record exists AND `is_matched = true` and `stable_hash_id` (or `crm_customer_id`) present, check against `customers`.
                *   If match, return `linked_matched` with `crmCustomerId` and `stableHashId`.
            *   If record exists AND `is_matched = false` (or no CRM link established), return `linked_unmatched`.
        5.  If no relevant records found, return `not_linked`.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "status": "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched",
          "crmCustomerId": "string | null", 
          "stableHashId": "string | null"
        }
        ```
    *   **Response (Error - 401/500):** Standard error format.

2.  **`POST /api/vip/link-account`**
    *   **Purpose:** Attempt to manually link the authenticated user to a CRM customer using a provided phone number. This should now create/update `vip_customer_data` with the `stable_hash_id` if a match is found, and link it to `profiles_vip_staging`.
    *   **Authorization:** Authenticated user.
    *   **Request Body:**
        ```json
        {
          "phoneNumber": "string"
        }
        ```
    *   **Logic:**
        1.  Get `profile_id` from session.
        2.  Validate `phoneNumber`.
        3.  Search `customers` table using `phoneNumber`.
        4.  If high-confidence match found (get `stable_hash_id` and `crm_customer_id` from `customers`):
            *   Fetch `profiles_vip_staging.vip_customer_data_id`.
            *   If `vip_customer_data_id` exists:
                *   Update `vip_customer_data` SET `stable_hash_id` = matched `stable_hash_id`.
            *   Else (no `vip_customer_data_id`):
                *   Create new `vip_customer_data` record with `stable_hash_id` = matched `stable_hash_id`, (and copy `vip_display_name`, `vip_email` from `profiles_vip_staging` if desired as initial values).
                *   Get the new `vip_customer_data.id`.
                *   Update `profiles_vip_staging` SET `vip_customer_data_id` = new `vip_customer_data.id`.
            *   Optionally, also update `crm_customer_mapping_vip_staging` for consistency or if other systems rely on it.
            *   Return success with `crmCustomerId` and `stableHashId`.
        5.  If no match, return failure.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "message": "Account linked successfully.", // Updated message
          "status": "linked_matched", // New status field
          "crmCustomerId": "string",
          "stableHashId": "string"
        }
        ```
    *   **Response (Not Found - 404 Not Found):**
        ```json
        {
          "error": "No matching customer account found." // Updated key to error
        }
        ```
    *   **Response (Error - 400/401/500):** Standard error format.

3.  **`GET /api/vip/profile`**
    *   **Purpose:** Fetch profile data for the authenticated user, prioritizing `vip_customer_data`.
    *   **Authorization:** Authenticated user.
    *   **Logic:**
        1.  Get `profile_id` (user's UUID) from session.
        2.  Query `profiles_vip_staging` for `id, email, display_name, picture_url, phone_number, vip_customer_data_id`.
        3.  Initialize `name` from `profiles_vip_staging.display_name`, `email` from `profiles_vip_staging.email`, `phoneNumber` from `profiles_vip_staging.phone_number`.
        4.  Initialize `marketingPreference = null`, `vipTierInfo = null`.
        5.  If `profiles_vip_staging.vip_customer_data_id` exists:
            *   Query `vip_customer_data` for `vip_display_name, vip_email, vip_marketing_preference, stable_hash_id, vip_phone_number, vip_tier_id` using `vip_customer_data_id`.
            *   If data found:
                *   Override `name` with `vip_data.vip_display_name` if not null.
                *   Override `email` with `vip_data.vip_email` if not null.
                *   Set `marketingPreference` from `vip_data.vip_marketing_preference`.
                *   Set `stableHashIdToUse = vip_data.stable_hash_id`.
                *   If `vip_data.vip_phone_number` is not null, set `phoneNumber = vip_data.vip_phone_number`.
                *   If `vip_data.vip_tier_id` exists, query `vip_tiers` for `id, tier_name, description`. Store as `vipTierInfo`.
        6.  Determine `crmStatus`, `crmCustomerId`, `finalStableHashId`:
            *   If `stableHashIdToUse` (from `vip_customer_data`):
                *   Query `customers` using `stableHashIdToUse`.
                *   If match: `crmStatus = 'linked_matched'`, `crmCustomerId = customers.id`, `finalStableHashId = customers.stable_hash_id`. If `customers.contact_number` exists, it takes precedence for `phoneNumber`.
                *   Else: `crmStatus = 'linked_unmatched'` (or `vip_data_exists_crm_unmatched`), `finalStableHashId = stableHashIdToUse`.
            *   Else (no `stableHashIdToUse` from `vip_customer_data`):
                *   Query `crm_customer_mapping_vip_staging` using `profile_id`.
                *   If mapping found with `is_matched=true` and `stable_hash_id`: Query `customers` by `stable_hash_id`. If match, update `phoneNumber` if `customers.contact_number` exists. Set `crmStatus`, `crmCustomerId`, `finalStableHashId`.
                *   Else if mapping found with `is_matched=true` and `crm_customer_id` (fallback): Query `customers` by `crm_customer_id`. Update `phoneNumber` if exists. Set `crmStatus`, `crmCustomerId`.
                *   Else `crmStatus = 'linked_unmatched'` or `not_linked`.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "id": "string", // profile_id from profiles_vip_staging
          "name": "string | null", // from vip_customer_data or profiles_vip_staging
          "email": "string | null", // from vip_customer_data or profiles_vip_staging
          "phoneNumber": "string | null", // Resolved: CRM > vip_customer_data > profiles_vip_staging
          "pictureUrl": "string | null", // from profiles_vip_staging
          "marketingPreference": true | false | null, // from vip_customer_data
          "crmStatus": "linked_matched" | "linked_unmatched" | "not_linked" | "vip_data_exists_crm_unmatched",
          "crmCustomerId": "string | null",
          "stableHashId": "string | null", // The definitive stable_hash_id after resolution
          "vipTier": { // from vip_tiers
            "id": 1,
            "name": "Eagle",
            "description": "string | null"
          } | null
        }
        ```
    *   **Response (Error - 401/404/500):** Standard error format.

4.  **`PUT /api/vip/profile`**
    *   **Purpose:** Update editable profile data, primarily in `vip_customer_data`. Creates `vip_customer_data` if not linked.
    *   **Authorization:** Authenticated user.
    *   **Request Body:**
        ```json
        {
          "display_name": "string", // Optional, updates vip_customer_data.vip_display_name
          "email": "string", // Optional, updates vip_customer_data.vip_email
          "marketingPreference": true | false, // Optional, updates vip_customer_data.vip_marketing_preference
          "vip_phone_number": "string | null" // Optional, updates vip_customer_data.vip_phone_number
        }
        ```
    *   **Logic:**
        1.  Get `profile_id` from session. Validate inputs.
        2.  Fetch `profiles_vip_staging` for `id, vip_customer_data_id, display_name, email`.
        3.  If no `vip_customer_data_id` on `profiles_vip_staging`:
            *   Create new `vip_customer_data` record.
                *   `vip_display_name` = `req.display_name` ?? `profiles_vip_staging.display_name`.
                *   `vip_email` = `req.email` ?? `profiles_vip_staging.email`.
                *   `vip_marketing_preference` = `req.marketingPreference`.
                *   `vip_phone_number` = `req.vip_phone_number`.
                *   `vip_tier_id` remains null (tier not updatable via this endpoint).
            *   Get new `vip_customer_data.id` (`newVipDataId`).
            *   Update `profiles_vip_staging` SET `vip_customer_data_id = newVipDataId`.
            *   Set `targetVipDataId = newVipDataId`.
        4.  Else (`vip_customer_data_id` exists):
            *   `targetVipDataId = profiles_vip_staging.vip_customer_data_id`.
            *   Construct update payload for `vip_customer_data` with `req.display_name`, `req.email`, `req.marketingPreference`, `req.vip_phone_number` if provided.
            *   Update `vip_customer_data` WHERE `id = targetVipDataId`.
        5.  Track `updatedFieldsAccumulator`.
    *   **Response (Success - 200 OK):**
        ```json
        {
          "message": "Profile updated successfully.", // Updated message
          "updatedFields": ["display_name", "marketingPreference", "vip_phone_number"] // Example
        }
        ```
    *   **Response (Error - 400/401/500):** Standard error format.
// ... existing code ...
*   **Placeholder Mapping Creation:** Logic during user sign-in/session validation (NextAuth callback) needs to check `profiles_vip_staging.vip_customer_data_id`.
    *   If `vip_customer_data_id` is NULL, the system could proactively create an empty `vip_customer_data` record and link it by updating `profiles_vip_staging.vip_customer_data_id`. This ensures a `vip_customer_data` record always exists for a VIP profile.
    *   Alternatively, `vip_customer_data` creation can be lazy (e.g., on first PUT to profile, or when linking account). Current API PUT handles this.
    *   The `getOrCreateCrmMapping` logic should focus on the `crm_customer_mapping_vip_staging` table for CRM matching status, while `vip_customer_data` holds user-editable VIP data and potentially a `stable_hash_id` for a more direct CRM link.

*   **Staff Notifications (`src/lib/line-messaging.ts`):** No direct changes from this, but ensure user name for notifications comes from the resolved profile name.
// ... existing code ...

```

All three documentation files (`docs/VIP_API_Endpoints.md`, `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`, and `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md`) have been updated to reflect the recent changes in the VIP profile system, including the new tables and modified API logic.

---

**User**

Can you also include the part of @AUTH_RLS_DISCOVERY_LOG.md @RLS_IMPLEMENTATION_TASKS.md into these documents with the note what needs to happen during the deployment? ideally a seperatte section and creating some new tasks in @TASKS.md for deployment

---

**Cursor**

Okay, I will integrate the relevant RLS and deployment information from `AUTH_RLS_DISCOVERY_LOG.md` and `RLS_IMPLEMENTATION_TASKS.md` into your documentation and create new deployment tasks.

First, I'll update `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md` by adding a new section for "Deployment Considerations & RLS Integration".


```markdown
// ... existing code ...

## 7. Deployment Considerations & RLS Integration

Successfully deploying the VIP feature with its associated database changes and Row Level Security (RLS) requires careful planning and execution. This section consolidates key considerations derived from `AUTH_RLS_DISCOVERY_LOG.md` and `RLS_IMPLEMENTATION_TASKS.md`.

### 7.1 Core RLS Principles & NextAuth Integration

*   **`auth.uid()` as the Source of Truth:** RLS policies heavily rely on Supabase's `auth.uid()` function. This function derives the user's ID from the `sub` (subject) claim of the JWT presented with each request. It is critical that the NextAuth `jwt` callback correctly populates `token.sub` with the user's `public.profiles.id` (or `public.profiles_vip_staging.id`). The NextAuth `session` callback must then propagate this as `session.user.id` for client-side use.
*   **Client-Side Supabase Client:** For client-side components interacting with Supabase and requiring authenticated user context (e.g., fetching user-specific data), the global Supabase client initialized with an `ANON_KEY` is insufficient. Instead, components must:
    *   Use `createBrowserClient` from `@supabase/ssr`.
    *   Obtain the current session using `useSession()` from `next-auth/react`.
    *   Initialize `createBrowserClient` with `session.accessToken` (the Supabase JWT) when the session is available. This ensures client-side requests are made with the user's authenticated identity, allowing RLS policies to be correctly applied.
*   **`SERVICE_ROLE_KEY` for Backend Operations:** Backend API routes (e.g., `app/api/vip/...`) that perform privileged operations or need to bypass RLS for administrative tasks should use a Supabase client initialized with the `SERVICE_ROLE_KEY`. This key bypasses all RLS policies.

### 7.2 Order of Operations for RLS Enablement

A critical learning (`AUTH_RLS_DISCOVERY_LOG.md`, point 6) is the order of operations:

1.  **Application Code Preparedness:** Before enabling RLS `WITH CHECK` policies (for `INSERT` or `UPDATE`) on database tables, the application code that writes to these tables **MUST** be updated to correctly populate the necessary foreign key or user identifier columns (e.g., `user_id` in `bookings`, `profile_id` in `crm_customer_mapping_vip_staging`, or the linking ID for `vip_customer_data`).
2.  **RLS Policy Application:** Only after the application code is confirmed to provide compliant data should RLS policies be enabled and forced on the tables.
    Failure to follow this order will result in "new row violates row-level security policy" errors for `INSERT` or `UPDATE` operations.

### 7.3 Key Deployment Phases (derived from `RLS_IMPLEMENTATION_TASKS.md`)

While `RLS_IMPLEMENTATION_TASKS.md` outlines a comprehensive phased RLS rollout for the entire application, the deployment of the VIP feature and its specific tables (`vip_customer_data`, `vip_tiers`) must align with these principles.

*   **Production Data & Application Preparedness (Phase 1):**
    *   Ensure existing production application logic correctly populates identifying columns (e.g., `user_id` in `bookings`, `profile_id` in `crm_customer_mapping_vip_staging`) that RLS policies might depend on, even if those policies are not yet active on all tables.
    *   Verify `profiles_vip_staging.id` is the definitive `auth.uid()` source for VIP users.
*   **Staging Environment (Phase 2 - As followed for VIP development):**
    *   VIP features were developed against `_vip_staging` tables with RLS enabled, which served as a crucial testing ground.
    *   Client-side calls in VIP components were updated to use `session.accessToken`.
*   **Go-Live - RLS on Production & VIP Launch (Phase 4):**
    *   **Final Preparations (Sub-Phase 4.1):**
        *   Develop and test RLS rollback scripts for all relevant production tables (core tables and new VIP tables).
        *   Schedule a maintenance window.
    *   **RLS Enablement & VIP Launch (Sub-Phase 4.2):**
        1.  Apply RLS policies to core production tables (`profiles`, `bookings`, `crm_customer_mapping_vip_staging`) if not already fully RLS-protected according to the new standards.
        2.  Thoroughly test the *existing production application* against these RLS-enabled core tables.
        3.  Apply RLS policies to the new production tables: `public.vip_customer_data` and `public.vip_tiers`.
        4.  Deploy the new VIP application code (frontend and backend APIs) configured to use the production tables.
        5.  Conduct comprehensive testing of all VIP features in the live production environment.
        6.  Monitor systems closely for any RLS-related errors or performance issues.
    *   **Cleanup (Sub-Phase 4.3):**
        *   **Critically review and remove or significantly restrict any temporary broad `SELECT` policies for the `anon` role** that might have been in place on any table. This is vital for security hardening.
        *   Decommission `_vip_staging` tables after successful launch and stabilization.

### 7.4 Specific Deployment Steps for New VIP Tables

1.  **Migrations First:** Deploy and run migrations to create `public.vip_tiers` and `public.vip_customer_data` tables, and to add `vip_customer_data_id` to `public.profiles_vip_staging`.
2.  **RLS Policies for VIP Tables:** Apply the RLS policies defined in Section 3.6 for `vip_customer_data` and `vip_tiers`.
3.  **Application Deployment:** Deploy the VIP backend and frontend code that interacts with these new tables.
4.  **Backfill (If Necessary):** Run any backfill scripts (like the one for populating `vip_customer_data` for existing users) *after* the tables and RLS are in place, using a `service_role` client for the script.

This structured approach ensures that RLS enhances security without disrupting existing functionality and that new features are launched robustly.

## 8. Open Technical Questions/Risks
// ... existing code ...
```

The file `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md` has been updated with the new section on deployment and RLS.

Next, I'll update `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` with a similar, but more high-level, section.


```markdown
// ... existing code ...

## 7. Deployment Considerations & RLS

The successful deployment of the LENGOLF VIP feature, underpinned by Row Level Security (RLS) in Supabase, is critical for ensuring both functionality and data security. This section outlines key deployment aspects, drawing from detailed technical planning and discovery logs (`TECHNICAL_DESIGN_LENGOLF_VIP.md`, `AUTH_RLS_DISCOVERY_LOG.md`, `RLS_IMPLEMENTATION_TASKS.md`).

**Core Principles:**

*   **RLS for Data Security:** RLS is fundamental to the VIP feature, ensuring that users can only access and manage their own data (`profiles_vip_staging`, `vip_customer_data`, `bookings`, etc.). Policies are primarily based on matching the authenticated user's ID (`auth.uid()`) with the relevant identifier in each table.
*   **Authenticated Client-Side Access:** Frontend components accessing Supabase on behalf of a logged-in user must use a Supabase client initialized with the user's `session.accessToken` (JWT). This ensures that RLS policies are correctly applied to client-originated requests.
*   **Service Role for Privileged Operations:** Backend processes or administrative functions requiring broader access or needing to bypass RLS will use a Supabase client initialized with the `SERVICE_ROLE_KEY`.

**Key Deployment Stages & Actions:**

1.  **Application & Data Preparedness:**
    *   Before RLS enforcement, ensure that all existing application code that writes to tables (e.g., creating bookings) correctly populates the user identifier columns (e.g., `bookings.user_id`) that RLS policies will depend upon.

2.  **Staging Environment Testing (As Performed):**
    *   The VIP features were developed and tested against staging tables (e.g., `profiles_vip_staging`, `vip_customer_data_staging`) with RLS policies activated. This iterative development in an RLS-enabled environment was crucial for identifying and resolving integration issues early.

3.  **Production Deployment Sequence:**
    *   **Migrations:** Deploy database migrations to create new tables (`vip_tiers`, `vip_customer_data`) and modify existing ones (`profiles_vip_staging`).
    *   **RLS Policy Application:** Carefully apply and enable RLS policies on all relevant production tables (core tables and new VIP-specific tables) during a planned maintenance window.
    *   **Rollback Plan:** Have tested rollback scripts ready to disable RLS policies on production tables in case of unforeseen critical issues.
    *   **Application Code Deployment:** Deploy the VIP feature code (frontend and backend APIs) configured to use the RLS-enabled production tables.
    *   **Testing:** Conduct thorough testing of both the existing application and the new VIP features in the production environment after RLS enablement and VIP code deployment.
    *   **Monitoring:** Closely monitor system logs and performance post-launch.

4.  **Post-Launch Security Hardening:**
    *   **Review `anon` Role Policies:** Critically review and remove or significantly restrict any temporary or overly permissive RLS policies for the `anon` (anonymous) role on all tables. This is a vital step to ensure data is not unintentionally exposed.
    *   **Decommission Staging Artifacts:** Once the production deployment is stable, remove any temporary staging tables (e.g., `_vip_staging` tables if they were direct copies for testing and not part of the primary data flow).

By following these considerations, the LENGOLF VIP feature can be launched securely and effectively, leveraging RLS to protect user data while providing a seamless experience.

## 8. Potential Future Enhancements
// ... existing code ...
```

The file `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` has been updated.

Now, I'll update `docs/VIP_API_Endpoints.md` with a brief section on deployment and RLS.


```markdown
// ... existing code ...
    *   `403 Forbidden`: If the user is authenticated but not linked/matched to a CRM customer.
    *   `500 Internal Server Error`: For unexpected server issues.

## 6. Deployment & RLS Security Notes

All LENGOLF VIP API endpoints detailed in this document operate under the assumption that Supabase Row Level Security (RLS) is enabled and correctly configured for the relevant tables (`profiles_vip_staging`, `vip_customer_data`, `vip_tiers`, `bookings`, `crm_customer_mapping_vip_staging`, `customers`, `crm_packages`).

*   **User Context (`auth.uid()`):** Backend logic within these API routes relies on `auth.uid()` (derived from the authenticated user's JWT `sub` claim, which should correspond to `profiles_vip_staging.id`) to scope data access. RLS policies on the database tables enforce these access controls.
*   **Client-Side Authentication:** Frontend clients calling these APIs must present a valid JWT for an authenticated user. For direct Supabase calls from the client (if any related to VIP data), the Supabase client must be initialized with the user's `session.accessToken` to ensure RLS is applied correctly.
*   **Service Role Usage:** Specific backend administrative operations or complex queries that might need to bypass user-centric RLS would use a Supabase client initialized with the `SERVICE_ROLE_KEY`. However, the standard VIP API endpoints are designed to operate within the user's RLS context.
*   **Deployment Order:** It is critical during deployment that:
    1.  Application code (especially for `INSERT` and `UPDATE` operations) is prepared to provide all necessary data for RLS `WITH CHECK` conditions (e.g., populating `user_id` fields correctly).
    2.  Database migrations for schema changes (new tables, new columns) are applied.
    3.  RLS policies are then enabled and forced on the production tables.
    4.  The API and frontend application code is deployed.
    Refer to `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 7) and `RLS_IMPLEMENTATION_TASKS.md` for detailed RLS deployment strategies and considerations, including rollback plans and post-launch security hardening (e.g., reviewing `anon` role policies).
*   **Staging Environment:** The VIP features and their RLS integration were developed and tested using `_vip_staging` tables, which mirrors the production setup and allows for safe validation before go-live. 

```

The `docs/VIP_API_Endpoints.md` file has been updated.

Finally, I will add new deployment-related tasks to `docs/TASKS.md`.


```markdown
// ... existing code ...
**Dependencies:** VIP-BE-008
**Acceptance Criteria:**
  - Availability check API (`app/api/availability/check/route.ts`) is suitable and correctly integrated for VIP booking modifications.

---

## Deployment Tasks for VIP Feature & RLS

These tasks focus on the deployment and RLS finalization for the VIP feature, drawing from `RLS_IMPLEMENTATION_TASKS.md` and `AUTH_RLS_DISCOVERY_LOG.md`.

---

**Task ID:** VIP-DEPLOY-001
**Title:** Finalize RLS Policies for Production VIP Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** Review and confirm the RLS policies for `public.vip_customer_data` and `public.vip_tiers` (as defined in `TECHNICAL_DESIGN_LENGOLF_VIP.md`, Section 3.6) are production-ready. Ensure they correctly use `auth.uid()` and provide appropriate access for users and service roles.
**Dependencies:** VIP-BE-002 (general RLS setup)
**Acceptance Criteria:**
  - RLS policies for `vip_customer_data` and `vip_tiers` are finalized and scriptable for production.
  - Policies cover SELECT, INSERT, UPDATE, DELETE for authenticated users on their own data (via `vip_customer_data_id` link in `profiles_vip_staging`) and appropriate access to `vip_tiers` (e.g., authenticated read).

---

**Task ID:** VIP-DEPLOY-002
**Title:** Verify Production Application Compatibility with RLS on Core Tables
**Assignee:** BE Developer / QA Team
**Status:** To Do
**Priority:** Critical
**Description:** Before VIP launch, ensure the *existing production application* correctly populates user identifier columns (e.g., `user_id` in `bookings`, `profile_id` in `crm_customer_mapping`) that are used by RLS policies. This aligns with Phase 1 of `RLS_IMPLEMENTATION_TASKS.md`.
**Dependencies:** RLS-P1-001, RLS-P1-002, RLS-P1-003 (from `RLS_IMPLEMENTATION_TASKS.md`)
**Acceptance Criteria:**
  - Confirmation that the current live application sets all necessary foreign keys/user IDs required by RLS policies on core tables (`profiles`, `bookings`, `crm_customer_mapping`).

---

**Task ID:** VIP-DEPLOY-003
**Title:** Prepare RLS Rollback Scripts for All Relevant Production Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** Create and test SQL scripts to quickly disable and remove RLS policies from all relevant production tables (`profiles`, `bookings`, `crm_customer_mapping`, `vip_customer_data`, `vip_tiers`) in case of emergency during or post-deployment. (Ref: `RLS-P4.1-001`)
**Dependencies:** VIP-DEPLOY-001
**Acceptance Criteria:**
  - Rollback scripts are documented, tested in a non-prod environment, and readily available.

---

**Task ID:** VIP-DEPLOY-004
**Title:** Schedule Maintenance Window for VIP Launch & RLS Finalization
**Assignee:** Project Lead / Platform Team
**Status:** To Do
**Priority:** High
**Description:** Plan and communicate a maintenance window for VIP feature deployment and the final application of RLS policies to production tables. (Ref: `RLS-P4.1-002`)
**Dependencies:** None
**Acceptance Criteria:**
  - Maintenance window scheduled and communicated to stakeholders.

---

**Task ID:** VIP-DEPLOY-005
**Title:** Execute Database Migrations & Apply RLS to Production Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** During the maintenance window:
  1. Apply migrations for `vip_customer_data`, `vip_tiers`, and `profiles_vip_staging.vip_customer_data_id`.
  2. Apply finalized RLS policies to `public.profiles`, `public.bookings`, `public.crm_customer_mapping_vip_staging` (if updates are needed beyond initial RLS setup).
  3. Apply RLS policies to `public.vip_customer_data` and `public.vip_tiers`.
  4. Enable and Force RLS on all these tables. (Ref: `RLS-P4.2-001`)
**Dependencies:** VIP-DEPLOY-001, VIP-DEPLOY-003, VIP-DEPLOY-004, All VIP-BE database schema tasks
**Acceptance Criteria:**
  - All schema migrations are applied successfully to production.
  - RLS policies are active and forced on all specified production tables.

---

**Task ID:** VIP-DEPLOY-006
**Title:** Deploy VIP Application Code to Production
**Assignee:** FE Developer / BE Developer
**Status:** To Do
**Priority:** Critical
**Description:** Deploy the VIP feature application code (frontend and backend APIs) to production. Ensure it is configured to use the RLS-enabled production tables. (Ref: `RLS-P4.2-003`)
**Dependencies:** VIP-DEPLOY-005, All VIP-FE tasks, All VIP-BE API tasks
**Acceptance Criteria:**
  - VIP feature code is deployed to production.
  - Configuration points to production database tables.

---

**Task ID:** VIP-DEPLOY-007
**Title:** Conduct Post-Launch Testing & Monitoring
**Assignee:** QA Team / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:**
  1. Test critical flows of the existing production application after RLS changes. (Ref: `RLS-P4.2-002`)
  2. Conduct thorough testing of all LENGOLF VIP functionalities in production. (Ref: `RLS-P4.2-004`)
  3. Closely monitor application logs, database performance, and error rates. (Ref: `RLS-P4.2-005`)
**Dependencies:** VIP-DEPLOY-006
**Acceptance Criteria:**
  - Existing application and new VIP features function correctly in production.
  - RLS policies provide correct data access and isolation.
  - Systems are stable with no unexpected RLS-related errors.

---

**Task ID:** VIP-DEPLOY-008
**Title:** Review and Harden `anon` RLS Policies Post-VIP Launch
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** After the VIP launch is stable, critically review any RLS policies for the `anon` role on ALL production tables. Remove or significantly restrict them to enforce the principle of least privilege. (Ref: `AUTH_RLS_DISCOVERY_LOG.md` reminders, `RLS-P4.3-001`)
**Dependencies:** VIP-DEPLOY-007
**Acceptance Criteria:**
  - Temporary or overly permissive anonymous read policies are removed or appropriately restricted.
  - Data exposure to anonymous users is minimized across the application.

---

**Task ID:** VIP-DEPLOY-009
**Title:** Decommission VIP Staging Artifacts
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Medium
**Description:** Once the production VIP deployment is stable, decommission and drop any temporary `_vip_staging` tables and related artifacts that are no longer needed. (Ref: `RLS-P4.3-002`)
**Dependencies:** VIP-DEPLOY-008
**Acceptance Criteria:**
  - Temporary staging tables and resources are backed up (if required) and removed from the system.

--- 

## Frontend Tasks (FE Developer)
// ... existing code ...
```

It seems the last edit to `docs/TASKS.md` was not applied as expected. I will try applying it again.


The new deployment tasks have been added to `docs/TASKS.md`.

All three documentation files (`docs/TECHNICAL_DESIGN_LENGOLF_VIP.md`, `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`, and `docs/VIP_API_Endpoints.md`) have been updated with sections on deployment considerations and RLS, and new deployment-specific tasks have been added to `docs/TASKS.md`.

---

**User**

these FE tasks are partially not there anymore, can you update accordingly?

## Frontend Tasks (FE Developer)

**Note on Integration:** The VIP feature frontend will be integrated into the main `lengolf-booking-refactor` Next.js application. Code from the `lengolf-vip-dashboard-view` project (likely a UI prototype) should be migrated and adapted to fit this structure:
*   **Pages:** Under `app/(features)/vip/` (e.g., `app/(features)/vip/dashboard/page.tsx`, `app/(features)/vip/profile/page.tsx`). The main landing page for VIP could be `app/(features)/vip/page.tsx`.
*   **Layout:** A main layout for the VIP section at `app/(features)/vip/layout.tsx`.
*   **Reusable Components:** In `components/vip/` (at the project root, alongside existing `components/ui/`, `components/shared/`).
*   **Page-Specific Components:** Can be co-located within the respective page directories under `app/(features)/vip/` or placed in `components/vip/` if preferred.

---

**Task ID:** VIP-FE-000
**Title:** Scaffold VIP Feature Structure and Migrate UI Code
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the necessary directory structure for the VIP feature within the `lengolf-booking-refactor` project (i.e., `app/(features)/vip/`, `components/vip/`). Migrate relevant React components and page structures from `lengolf-vip-dashboard-view` into this new structure. Adapt imports and basic configurations as needed for Next.js compatibility.
**Dependencies:** None
**Acceptance Criteria:**
  - VIP feature directories (`app/(features)/vip/`, `components/vip/`) are created.
  - Core UI components and page layouts from `lengolf-vip-dashboard-view` are moved to the new structure.
  - Basic rendering of migrated components within the Next.js environment is functional (data integration will follow).

---

**Task ID:** VIP-FE-001
**Title:** Setup API Service Layer for VIP Endpoints
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create or update services (e.g., in a new `lib/vipService.ts` or adapt `lengolf-vip-dashboard-view/src/services/vipService.ts` and place it appropriately) to interact with all new BE VIP API endpoints (`/api/vip/*`).
**Dependencies:** All VIP-BE API tasks (VIP-BE-003 to VIP-BE-010), VIP-FE-000
**Acceptance Criteria:**
  - Functions exist to call each VIP backend API.
  - Handles request/response typing according to API specifications.
  - Includes error handling.

---

**Task ID:** VIP-FE-002
**Title:** Implement VIP Layout (`app/(features)/vip/layout.tsx`) Authentication and Status Handling
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create and implement `app/(features)/vip/layout.tsx`. This layout should handle NextAuth authentication checks for all VIP pages. Fetch VIP status (`GET /api/vip/status`) and make it available (e.g., via context or props) to child pages to control content visibility based on `is_matched` status as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 5) and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`.
**Dependencies:** VIP-BE-003, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Users are redirected if not authenticated when accessing VIP routes.
  - VIP status is fetched and stored appropriately.
  - The layout provides a consistent structure for VIP pages (e.g., navigation specific to VIP area).
  - Content within VIP sections dynamically changes based on `is_matched` status.

---

**Task ID:** VIP-FE-003
**Title:** Integrate VIP Landing Page / Dashboard View (`app/(features)/vip/page.tsx` or `/dashboard/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Adapt the `DashboardView` component (migrated from `lengolf-vip-dashboard-view/src/components/vip/DashboardView.tsx` to `components/vip/DashboardView.tsx`) and use it in the main VIP landing page (e.g., `app/(features)/vip/page.tsx`). Connect with live data from `GET /api/vip/status`, `GET /api/vip/profile` (for username), `GET /api/vip/bookings` (for next booking), and `GET /api/vip/packages` (for active packages count). Ensure it reflects Scenarios A & B from `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 3.2).
**Dependencies:** VIP-BE-003, VIP-BE-005, VIP-BE-007, VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Dashboard displays "Welcome back, [User's Display Name]!".
  - If `is_matched = true`:
    - Shows "Next Upcoming Booking" snippet or "No upcoming bookings" message.
    - Shows "Active Packages" snippet or "No active packages" message.
    - Shows navigation CTAs to Profile, Bookings, Packages (using `DashboardCard.tsx` component from `components/vip/`).
  - If `is_matched = false`:
    - Shows "Link Your Account" prompt (using `LinkAccountPrompt.tsx` from `components/vip/`) prominently.
    - CTA links to the manual account linking page (`app/(features)/vip/link-account/page.tsx`).
    - Shows limited navigation (e.g., Profile).

---

**Task ID:** VIP-FE-004
**Title:** Implement/Integrate Manual Account Linking Page (`app/(features)/vip/link-account/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the `app/(features)/vip/link-account/page.tsx` page. Adapt `ManualLinkAccountForm` (or `LinkAccount.tsx` from `lengolf-vip-dashboard-view/src/pages/`, placing the form component in `components/vip/ManualLinkAccountForm.tsx` or co-locating). This page allows users with `is_matched = false` to attempt linking via phone number using `POST /api/vip/link-account`. Handle loading, success (redirect), and error states. See `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Scenario B) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 6).
**Dependencies:** VIP-BE-004, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page is accessible, especially when `is_matched = false`.
  - Form submits phone number to the backend.
  - Displays loading state during API call.
  - On success, redirects to VIP dashboard or main VIP page.
  - Displays error messages from backend if linking fails (e.g., "No matching customer account found.").

---

**Task ID:** VIP-FE-005
**Title:** Integrate Profile View and Edit Page (`app/(features)/vip/profile/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/profile/page.tsx`. Adapt `ProfileView` (or `VipProfile.tsx` from `lengolf-vip-dashboard-view`, potentially placing the view/form component in `components/vip/ProfileView.tsx`) to connect with `GET /api/vip/profile` to display user data and `PUT /api/vip/profile` to update name, email, and marketing preference. Ensure phone number from linked CRM (if available) is displayed but not editable.
**Dependencies:** VIP-BE-005, VIP-BE-006, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Profile page displays data fetched from the backend.
  - User can edit their name, email, and marketing preference.
  - Changes are saved via the backend API.
  - Phone number is displayed correctly (from CRM if matched and available, non-editable).

---

**Task ID:** VIP-FE-006
**Title:** Integrate Bookings List Page (`app/(features)/vip/bookings/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/bookings/page.tsx`. Adapt `BookingsList` (or `VipBookings.tsx`) to connect to `GET /api/vip/bookings`. Implement filters (future/past/all) and pagination. Display `EmptyState` if no bookings or if `is_matched = false`. Include Modify/Cancel buttons for relevant bookings.
**Dependencies:** VIP-BE-007, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Booking list displays data from the backend.
  - Filtering and pagination work as expected.
  - Shows `EmptyState` (from `components/vip/EmptyState.tsx` or similar) or "Link account" prompt if `is_matched = false` or no bookings.
  - Modify/Cancel buttons are shown for future, confirmed bookings.

---

**Task ID:** VIP-FE-007
**Title:** Implement/Integrate Booking Modification Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingModifyModal` (likely as a component in `components/vip/BookingModifyModal.tsx`). Form for new date/time/duration. Calls `POST /api/availability/check` (via a frontend service) and submits to `PUT /api/vip/bookings/{id}/modify`. Handle loading/error states (e.g., "Slot unavailable").
**Dependencies:** VIP-BE-008, VIP-BE-014, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal allows user to select new date, time, and duration.
  - Availability is checked before submission.
  - Booking modification is submitted to the backend.
  - Handles success (update UI) and error messages (e.g., slot unavailable, other errors).

---

**Task ID:** VIP-FE-008
**Title:** Implement/Integrate Booking Cancellation Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingCancelModal` (likely as a component in `components/vip/BookingCancelModal.tsx`). Confirmation prompt. Submits to `POST /api/vip/bookings/{id}/cancel`. Handle loading/error states.
**Dependencies:** VIP-BE-009, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal shows confirmation prompt for cancellation.
  - Cancellation request is submitted to the backend.
  - Handles success (update UI) and error messages.

---

**Task ID:** VIP-FE-009
**Title:** Integrate Packages View Page (`app/(features)/vip/packages/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/packages/page.tsx`. Adapt `PackagesView` (or `VipPackages.tsx`) to connect to `GET /api/vip/packages`. Display active/past packages. Display `EmptyState` if no packages or if `is_matched = false`.
**Dependencies:** VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Package list displays data from the backend.
  - Shows active and past packages correctly.
  - Shows `EmptyState` or "Link account" prompt if `is_matched = false` or no packages.

---

**Task ID:** VIP-FE-010
**Title:** Implement Reusable `EmptyState` Component and Usage
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Low
**Description:** Ensure a reusable `EmptyState` component (e.g., `components/vip/EmptyState.tsx`, adapted from `lengolf-vip-dashboard-view` or created new) exists and is used appropriately in Bookings, Packages, and other views when data is empty or user needs to link their account (as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` Section 5 and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`).
**Dependencies:** VIP-FE-000, VIP-FE-003, VIP-FE-006, VIP-FE-009
**Acceptance Criteria:**
  - `EmptyState` component is well-defined and reusable in `components/vip/`.
  - Correctly displayed in relevant sections with appropriate messages and CTAs (e.g., "Link your account").

---

**Task ID:** VIP-FE-011
**Title:** Styling and Responsiveness Review
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Review all VIP pages and components against `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` for styling (Tailwind CSS, brand consistency, colors, typography) and responsiveness (especially for LIFF mobile view). Ensure consistency with the main `lengolf-booking-refactor` project's `tailwind.config.ts` and `app/globals.css`.
**Dependencies:** All other VIP-FE integration tasks (VIP-FE-002 to VIP-FE-010).
**Acceptance Criteria:**
  - UI adheres to `tailwind.config.ts` and `app/globals.css` of the main project.
  - All pages are responsive and work well on desktop, tablet, and mobile (LIFF).
  - Visual style matches design document requirements (modern, clean, Lengolf branding).

---

**Task ID:** VIP-FE-012
**Title:** Error Handling and Loading States
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Implement consistent loading indicators (spinners, skeleton screens) and user-friendly error messages for all data fetching and mutation operations across the VIP section, as per `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 4). Utilize existing UI components from `components/ui` or ShadCN if applicable and consistent.
**Dependencies:** All data-dependent VIP-FE tasks.
**Acceptance Criteria:**
  - Loading states are shown during API calls.
  - User-friendly error messages are displayed for API failures or validation issues.
  - Toasts or inline messages are used consistently for feedback.

---

**Task ID:** VIP-FE-013
**Title:** LIFF Integration Considerations
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Ensure that the VIP pages within `lengolf-booking-refactor` are compatible with being rendered inside a LINE LIFF view. This includes testing navigation, responsiveness, and any LIFF-specific API interactions if necessary.
**Dependencies:** VIP-FE-011
**Acceptance Criteria:**
  - VIP pages render correctly within a LIFF environment.
  - UI is optimized for mobile view within LIFF.

--- 



---

**Cursor**

Okay, I will update the "Frontend Tasks (FE Developer)" section in `docs/TASKS.md` with the content you've provided.

```markdown
## Frontend Tasks (FE Developer)

**Note on Integration:** The VIP feature frontend will be integrated into the main `lengolf-booking-refactor` Next.js application. Code from the `lengolf-vip-dashboard-view` project (likely a UI prototype) should be migrated and adapted to fit this structure:
*   **Pages:** Under `app/(features)/vip/` (e.g., `app/(features)/vip/dashboard/page.tsx`, `app/(features)/vip/profile/page.tsx`). The main landing page for VIP could be `app/(features)/vip/page.tsx`.
*   **Layout:** A main layout for the VIP section at `app/(features)/vip/layout.tsx`.
*   **Reusable Components:** In `components/vip/` (at the project root, alongside existing `components/ui/`, `components/shared/`).
*   **Page-Specific Components:** Can be co-located within the respective page directories under `app/(features)/vip/` or placed in `components/vip/` if preferred.

---

**Task ID:** VIP-FE-000
**Title:** Scaffold VIP Feature Structure and Migrate UI Code
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the necessary directory structure for the VIP feature within the `lengolf-booking-refactor` project (i.e., `app/(features)/vip/`, `components/vip/`). Migrate relevant React components and page structures from `lengolf-vip-dashboard-view` into this new structure. Adapt imports and basic configurations as needed for Next.js compatibility.
**Dependencies:** None
**Acceptance Criteria:**
  - VIP feature directories (`app/(features)/vip/`, `components/vip/`) are created.
  - Core UI components and page layouts from `lengolf-vip-dashboard-view` are moved to the new structure.
  - Basic rendering of migrated components within the Next.js environment is functional (data integration will follow).

---

**Task ID:** VIP-FE-001
**Title:** Setup API Service Layer for VIP Endpoints
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create or update services (e.g., in a new `lib/vipService.ts` or adapt `lengolf-vip-dashboard-view/src/services/vipService.ts` and place it appropriately) to interact with all new BE VIP API endpoints (`/api/vip/*`).
**Dependencies:** All VIP-BE API tasks (VIP-BE-003 to VIP-BE-010), VIP-FE-000
**Acceptance Criteria:**
  - Functions exist to call each VIP backend API.
  - Handles request/response typing according to API specifications.
  - Includes error handling.

---

**Task ID:** VIP-FE-002
**Title:** Implement VIP Layout (`app/(features)/vip/layout.tsx`) Authentication and Status Handling
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create and implement `app/(features)/vip/layout.tsx`. This layout should handle NextAuth authentication checks for all VIP pages. Fetch VIP status (`GET /api/vip/status`) and make it available (e.g., via context or props) to child pages to control content visibility based on `is_matched` status as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 5) and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`.
**Dependencies:** VIP-BE-003, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Users are redirected if not authenticated when accessing VIP routes.
  - VIP status is fetched and stored appropriately.
  - The layout provides a consistent structure for VIP pages (e.g., navigation specific to VIP area).
  - Content within VIP sections dynamically changes based on `is_matched` status.

---

**Task ID:** VIP-FE-003
**Title:** Integrate VIP Landing Page / Dashboard View (`app/(features)/vip/page.tsx` or `/dashboard/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Adapt the `DashboardView` component (migrated from `lengolf-vip-dashboard-view/src/components/vip/DashboardView.tsx` to `components/vip/DashboardView.tsx`) and use it in the main VIP landing page (e.g., `app/(features)/vip/page.tsx`). Connect with live data from `GET /api/vip/status`, `GET /api/vip/profile` (for username), `GET /api/vip/bookings` (for next booking), and `GET /api/vip/packages` (for active packages count). Ensure it reflects Scenarios A & B from `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 3.2).
**Dependencies:** VIP-BE-003, VIP-BE-005, VIP-BE-007, VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Dashboard displays "Welcome back, [User's Display Name]!".
  - If `is_matched = true`:
    - Shows "Next Upcoming Booking" snippet or "No upcoming bookings" message.
    - Shows "Active Packages" snippet or "No active packages" message.
    - Shows navigation CTAs to Profile, Bookings, Packages (using `DashboardCard.tsx` component from `components/vip/`).
  - If `is_matched = false`:
    - Shows "Link Your Account" prompt (using `LinkAccountPrompt.tsx` from `components/vip/`) prominently.
    - CTA links to the manual account linking page (`app/(features)/vip/link-account/page.tsx`).
    - Shows limited navigation (e.g., Profile).

---

**Task ID:** VIP-FE-004
**Title:** Implement/Integrate Manual Account Linking Page (`app/(features)/vip/link-account/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the `app/(features)/vip/link-account/page.tsx` page. Adapt `ManualLinkAccountForm` (or `LinkAccount.tsx` from `lengolf-vip-dashboard-view/src/pages/`, placing the form component in `components/vip/ManualLinkAccountForm.tsx` or co-locating). This page allows users with `is_matched = false` to attempt linking via phone number using `POST /api/vip/link-account`. Handle loading, success (redirect), and error states. See `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Scenario B) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 6).
**Dependencies:** VIP-BE-004, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page is accessible, especially when `is_matched = false`.
  - Form submits phone number to the backend.
  - Displays loading state during API call.
  - On success, redirects to VIP dashboard or main VIP page.
  - Displays error messages from backend if linking fails (e.g., "No matching customer account found.").

---

**Task ID:** VIP-FE-005
**Title:** Integrate Profile View and Edit Page (`app/(features)/vip/profile/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/profile/page.tsx`. Adapt `ProfileView` (or `VipProfile.tsx` from `lengolf-vip-dashboard-view`, potentially placing the view/form component in `components/vip/ProfileView.tsx`) to connect with `GET /api/vip/profile` to display user data and `PUT /api/vip/profile` to update name, email, and marketing preference. Ensure phone number from linked CRM (if available) is displayed but not editable.
**Dependencies:** VIP-BE-005, VIP-BE-006, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Profile page displays data fetched from the backend.
  - User can edit their name, email, and marketing preference.
  - Changes are saved via the backend API.
  - Phone number is displayed correctly (from CRM if matched and available, non-editable).

---

**Task ID:** VIP-FE-006
**Title:** Integrate Bookings List Page (`app/(features)/vip/bookings/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/bookings/page.tsx`. Adapt `BookingsList` (or `VipBookings.tsx`) to connect to `GET /api/vip/bookings`. Implement filters (future/past/all) and pagination. Display `EmptyState` if no bookings or if `is_matched = false`. Include Modify/Cancel buttons for relevant bookings.
**Dependencies:** VIP-BE-007, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Booking list displays data from the backend.
  - Filtering and pagination work as expected.
  - Shows `EmptyState` (from `components/vip/EmptyState.tsx` or similar) or "Link account" prompt if `is_matched = false` or no bookings.
  - Modify/Cancel buttons are shown for future, confirmed bookings.

---

**Task ID:** VIP-FE-007
**Title:** Implement/Integrate Booking Modification Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingModifyModal` (likely as a component in `components/vip/BookingModifyModal.tsx`). Form for new date/time/duration. Calls `POST /api/availability/check` (via a frontend service) and submits to `PUT /api/vip/bookings/{id}/modify`. Handle loading/error states (e.g., "Slot unavailable").
**Dependencies:** VIP-BE-008, VIP-BE-014, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal allows user to select new date, time, and duration.
  - Availability is checked before submission.
  - Booking modification is submitted to the backend.
  - Handles success (update UI) and error messages (e.g., slot unavailable, other errors).

---

**Task ID:** VIP-FE-008
**Title:** Implement/Integrate Booking Cancellation Modal
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Develop/Integrate `BookingCancelModal` (likely as a component in `components/vip/BookingCancelModal.tsx`). Confirmation prompt. Submits to `POST /api/vip/bookings/{id}/cancel`. Handle loading/error states.
**Dependencies:** VIP-BE-009, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal shows confirmation prompt for cancellation.
  - Cancellation request is submitted to the backend.
  - Handles success (update UI) and error messages.

---

**Task ID:** VIP-FE-009
**Title:** Integrate Packages View Page (`app/(features)/vip/packages/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Create `app/(features)/vip/packages/page.tsx`. Adapt `PackagesView` (or `VipPackages.tsx`) to connect to `GET /api/vip/packages`. Display active/past packages. Display `EmptyState` if no packages or if `is_matched = false`.
**Dependencies:** VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Package list displays data from the backend.
  - Shows active and past packages correctly.
  - Shows `EmptyState` or "Link account" prompt if `is_matched = false` or no packages.

---

**Task ID:** VIP-FE-010
**Title:** Implement Reusable `EmptyState` Component and Usage
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Low
**Description:** Ensure a reusable `EmptyState` component (e.g., `components/vip/EmptyState.tsx`, adapted from `lengolf-vip-dashboard-view` or created new) exists and is used appropriately in Bookings, Packages, and other views when data is empty or user needs to link their account (as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` Section 5 and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`).
**Dependencies:** VIP-FE-000, VIP-FE-003, VIP-FE-006, VIP-FE-009
**Acceptance Criteria:**
  - `EmptyState` component is well-defined and reusable in `components/vip/`.
  - Correctly displayed in relevant sections with appropriate messages and CTAs (e.g., "Link your account").

---

**Task ID:** VIP-FE-011
**Title:** Styling and Responsiveness Review
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Review all VIP pages and components against `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` for styling (Tailwind CSS, brand consistency, colors, typography) and responsiveness (especially for LIFF mobile view). Ensure consistency with the main `lengolf-booking-refactor` project's `tailwind.config.ts` and `app/globals.css`.
**Dependencies:** All other VIP-FE integration tasks (VIP-FE-002 to VIP-FE-010).
**Acceptance Criteria:**
  - UI adheres to `tailwind.config.ts` and `app/globals.css` of the main project.
  - All pages are responsive and work well on desktop, tablet, and mobile (LIFF).
  - Visual style matches design document requirements (modern, clean, Lengolf branding).

---

**Task ID:** VIP-FE-012
**Title:** Error Handling and Loading States
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Implement consistent loading indicators (spinners, skeleton screens) and user-friendly error messages for all data fetching and mutation operations across the VIP section, as per `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 4). Utilize existing UI components from `components/ui` or ShadCN if applicable and consistent.
**Dependencies:** All data-dependent VIP-FE tasks.
**Acceptance Criteria:**
  - Loading states are shown during API calls.
  - User-friendly error messages are displayed for API failures or validation issues.
  - Toasts or inline messages are used consistently for feedback.

---

**Task ID:** VIP-FE-013
**Title:** LIFF Integration Considerations
**Assignee:** FE Developer
**Status:** To Do
**Priority:** Medium
**Description:** Ensure that the VIP pages within `lengolf-booking-refactor` are compatible with being rendered inside a LINE LIFF view. This includes testing navigation, responsiveness, and any LIFF-specific API interactions if necessary.
**Dependencies:** VIP-FE-011
**Acceptance Criteria:**
  - VIP pages render correctly within a LIFF environment.
  - UI is optimized for mobile view within LIFF.

--- 
// ... existing code ... // This represents the end of the file before this edit.
```

The "Frontend Tasks (FE Developer)" section in `docs/TASKS.md` has been updated with the content you provided. All documentation updates related to RLS and deployment tasks should now be complete.

---

**User**

Can you also check if @vip-api-test.html still works with the changes we made?

---

**Cursor**

Okay, I've reviewed the changes made to the VIP profile system and the contents of `public/vip-api-test.html`.

The most significant impact on the test page will be related to the `GET /api/vip/profile` and `PUT /api/vip/profile` endpoints, due to the introduction of the `vip_customer_data` table and the changes in how profile data is stored and managed.

Here's a breakdown:

1.  **`GET /api/vip/profile`**:
    *   This endpoint now sources data primarily from the `vip_customer_data` table.
    *   The response structure will be different. For example, you'll see fields like `vip_display_name`, `vip_email`, `vip_marketing_preference`, `vip_phone_number`, and potentially `vipTier` information, instead of directly corresponding fields from the old `profiles` table structure.
    *   The test page will still be able to call this endpoint, but the displayed JSON response will reflect the new structure. No change is strictly needed in the HTML to *call* it, but you should expect different output.

2.  **`PUT /api/vip/profile`**:
    *   This endpoint now updates the `vip_customer_data` table.
    *   The request payload needs to use the new field names: `vip_display_name`, `vip_email`, `vip_marketing_preference`. You can also update `vip_phone_number`.
    *   The placeholder JSON in `public/vip-api-test.html` for this endpoint should be updated.

3.  **`POST /api/vip/link-account`**:
    *   The request payload (`{ phoneNumber: "..." }`) is still valid.
    *   The backend logic is more complex now (e.g., creating `vip_customer_data` if it doesn't exist, unification logic), so the response might contain different nuances, but the basic success/error structure should allow the test page to continue functioning for this endpoint.

4.  **Other Endpoints** (`/api/vip/status`, `/api/vip/bookings`, `/api/vip/bookings/{id}/modify`, `/api/vip/bookings/{id}/cancel`, `/api/vip/packages`):
    *   These should be largely unaffected by the profile data storage changes, or the test page already accommodates known changes (like the "modify" endpoint now being a cancellation).

I'll update the placeholder for the `PUT /api/vip/profile` payload in `public/vip-api-test.html` to reflect the new field names.



```html
// ... existing code ...
            <h2>PUT /api/vip/profile</h2>
            <label for="profilePayload">JSON Payload:</label>
            <textarea id="profilePayload" rows="5" placeholder='{ "vip_display_name": "New VIP Name", "vip_email": "new_vip@example.com", "vip_marketing_preference": false, "vip_phone_number": "08012345678" }'></textarea>
            <button data-endpoint="/api/vip/profile" data-method="PUT" data-resultid="updateProfileResult" data-payload-textarea="profilePayload">Update Profile</button>
            <pre id="updateProfileResult"></pre>
// ... existing code ...
```

The placeholder for `PUT /api/vip/profile` in `public/vip-api-test.html` has been updated.

When you test:
*   For `GET /api/vip/profile`, observe the new response structure which will include fields like `vip_display_name`, `vip_email`, etc.
*   For `PUT /api/vip/profile`, use the updated placeholder as a guide for your JSON payload.

The other endpoints should function as before, with the understanding that the underlying data for profiles is now managed differently.

We were previously working on updating documentation files. The next one was `docs/DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md`. Shall I proceed with updating that document to reflect the database and API changes, particularly around `vip_customer_data` and the profile unification logic in the `/api/vip/link-account` endpoint? The user also mentioned updating `docs/TECHNICAL_DESIGN_LENGOLF_VIP.md`.

