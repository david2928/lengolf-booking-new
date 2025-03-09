-- Script to add a trigger for automatically generating stable_hash_id in the packages table
-- Run this script in your Supabase project SQL editor

-- First, create a function that will generate the stable_hash_id from the customer_name field
-- This function parses the phone number from parentheses at the end of the name
CREATE OR REPLACE FUNCTION generate_package_stable_hash_id()
RETURNS TRIGGER AS $$
DECLARE
    name_part TEXT;
    phone_part TEXT;
    phone_match TEXT[];
BEGIN
    -- Try to extract phone from the last parentheses in the name
    -- Pattern matches the last set of digits in parentheses
    SELECT regexp_match(NEW.customer_name, '\((\d+)\)[^\(]*$') INTO phone_match;
    
    IF phone_match IS NOT NULL AND array_length(phone_match, 1) > 0 THEN
        -- Extract the phone number
        phone_part := phone_match[1];
        
        -- Extract the name part (everything before the phone parentheses)
        name_part := regexp_replace(NEW.customer_name, '\s*\(\d+\)[^\(]*$', '');
    ELSE
        -- If no phone found, use the whole name
        name_part := NEW.customer_name;
        phone_part := '';
    END IF;
    
    -- Generate the stable_hash_id using the same formula as customers table
    NEW.stable_hash_id := md5(
        LOWER(TRIM(COALESCE(name_part, '')::TEXT)) || '::' || 
        REGEXP_REPLACE(COALESCE(phone_part, '')::TEXT, '[^0-9]', '', 'g')
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if the trigger already exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'before_packages_insert_update'
    ) THEN
        -- Create a trigger to execute this function before INSERT or UPDATE
        CREATE TRIGGER before_packages_insert_update
        BEFORE INSERT OR UPDATE ON packages
        FOR EACH ROW
        EXECUTE FUNCTION generate_package_stable_hash_id();
        
        RAISE NOTICE 'Created trigger for automatically generating stable_hash_id on packages table';
    ELSE
        RAISE NOTICE 'Trigger for generating stable_hash_id already exists on packages table';
    END IF;
END $$;

-- Generate stable_hash_id for all existing rows that don't have one
DO $$
DECLARE
    r RECORD;
    name_part TEXT;
    phone_part TEXT;
    phone_match TEXT[];
    new_hash TEXT;
BEGIN
    FOR r IN SELECT id, customer_name, stable_hash_id FROM packages WHERE stable_hash_id IS NULL OR stable_hash_id = '' LOOP
        -- Try to extract phone from the last parentheses in the name
        SELECT regexp_match(r.customer_name, '\((\d+)\)[^\(]*$') INTO phone_match;
        
        IF phone_match IS NOT NULL AND array_length(phone_match, 1) > 0 THEN
            -- Extract the phone number
            phone_part := phone_match[1];
            
            -- Extract the name part (everything before the phone parentheses)
            name_part := regexp_replace(r.customer_name, '\s*\(\d+\)[^\(]*$', '');
        ELSE
            -- If no phone found, use the whole name
            name_part := r.customer_name;
            phone_part := '';
        END IF;
        
        -- Generate the hash
        new_hash := md5(
            LOWER(TRIM(COALESCE(name_part, '')::TEXT)) || '::' || 
            REGEXP_REPLACE(COALESCE(phone_part, '')::TEXT, '[^0-9]', '', 'g')
        );
        
        -- Update the record
        UPDATE packages 
        SET stable_hash_id = new_hash
        WHERE id = r.id;
    END LOOP;
END $$;

-- Output a count of packages with and without hash ids
SELECT
    COUNT(*) as total_packages,
    COUNT(stable_hash_id) FILTER (WHERE stable_hash_id IS NOT NULL AND stable_hash_id != '') as packages_with_hash,
    COUNT(*) FILTER (WHERE stable_hash_id IS NULL OR stable_hash_id = '') as packages_without_hash
FROM packages; 