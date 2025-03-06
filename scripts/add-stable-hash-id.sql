-- SQL script to add stable_hash_id to the packages table
-- Run this on your CRM database

-- First check if the column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'packages' 
        AND column_name = 'stable_hash_id'
    ) THEN
        -- Add the stable_hash_id column
        ALTER TABLE packages
        ADD COLUMN stable_hash_id TEXT;
        
        RAISE NOTICE 'Added stable_hash_id column to packages table';
    ELSE
        RAISE NOTICE 'stable_hash_id column already exists in packages table';
    END IF;
END $$;

-- Generate stable_hash_id for all existing packages
-- This uses MD5 of the normalized customer name and phone

-- First, find the customer name column and phone column
-- Common names: customer_name, name, customer, etc.
-- Common phone names: contact_number, phone, phone_number, etc.

DO $$
DECLARE
    name_column TEXT := NULL;
    phone_column TEXT := NULL;
    id_column TEXT := NULL;
    customer_id_column TEXT := NULL;
    all_columns TEXT[];
    col TEXT;
BEGIN
    -- Get all columns in the packages table
    SELECT array_agg(column_name::TEXT) 
    INTO all_columns 
    FROM information_schema.columns 
    WHERE table_name = 'packages';
    
    RAISE NOTICE 'Found columns in packages table: %', all_columns;
    
    -- Find the customer name column
    FOREACH col IN ARRAY all_columns
    LOOP
        IF col IN ('customer_name', 'name', 'customer', 'client_name') THEN
            name_column := col;
            EXIT;
        END IF;
    END LOOP;
    
    -- Find the phone column
    FOREACH col IN ARRAY all_columns
    LOOP
        IF col IN ('contact_number', 'phone', 'phone_number', 'contact', 'mobile') THEN
            phone_column := col;
            EXIT;
        END IF;
    END LOOP;
    
    -- Find the ID column
    FOREACH col IN ARRAY all_columns
    LOOP
        IF col IN ('id', 'package_id', 'pid') THEN
            id_column := col;
            EXIT;
        END IF;
    END LOOP;
    
    -- Find the customer ID column
    FOREACH col IN ARRAY all_columns
    LOOP
        IF col IN ('customer_id', 'client_id', 'user_id', 'cid') THEN
            customer_id_column := col;
            EXIT;
        END IF;
    END LOOP;
    
    -- Generate the stable_hash_id with what we have
    IF name_column IS NOT NULL AND phone_column IS NOT NULL THEN
        -- We can generate the hash using name and phone
        EXECUTE format(
            'UPDATE packages 
             SET stable_hash_id = md5(LOWER(TRIM(COALESCE(%I, '''')::TEXT)) || ''::'' || 
                                     REGEXP_REPLACE(COALESCE(%I, '''')::TEXT, ''[^0-9]'', '''', ''g''))
             WHERE stable_hash_id IS NULL',
            name_column, phone_column
        );
        
        RAISE NOTICE 'Generated stable_hash_id for packages using name and phone columns: % and %', 
                     name_column, phone_column;
    ELSIF name_column IS NOT NULL THEN
        -- We can only use the name
        EXECUTE format(
            'UPDATE packages 
             SET stable_hash_id = md5(LOWER(TRIM(COALESCE(%I, '''')::TEXT)) || ''::noPhone'')
             WHERE stable_hash_id IS NULL',
            name_column
        );
        
        RAISE NOTICE 'Generated stable_hash_id for packages using only name column: %', name_column;
    ELSIF id_column IS NOT NULL AND customer_id_column IS NOT NULL THEN
        -- Use customer_id as a unique identifier
        EXECUTE format(
            'UPDATE packages 
             SET stable_hash_id = md5(%I::TEXT || ''::'' || %I::TEXT)
             WHERE stable_hash_id IS NULL',
            customer_id_column, id_column
        );
        
        RAISE NOTICE 'Generated stable_hash_id for packages using customer ID and package ID: % and %', 
                     customer_id_column, id_column;
    ELSE
        RAISE NOTICE 'Could not find appropriate columns to generate stable_hash_id';
    END IF;
    
    -- Create an index on stable_hash_id for better performance
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'packages' 
        AND column_name = 'stable_hash_id'
    ) THEN
        -- Create the index if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_indexes 
            WHERE tablename = 'packages' 
            AND indexname = 'idx_packages_stable_hash_id'
        ) THEN
            CREATE INDEX idx_packages_stable_hash_id ON packages (stable_hash_id);
            RAISE NOTICE 'Created index on stable_hash_id column';
        END IF;
    END IF;
END $$;

-- Get a count of packages with stable_hash_id
SELECT
    COUNT(*) as total_packages,
    COUNT(stable_hash_id) as packages_with_hash,
    COUNT(*) - COUNT(stable_hash_id) as packages_without_hash
FROM packages; 