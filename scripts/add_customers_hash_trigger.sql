-- Script to add a trigger for automatically generating stable_hash_id in the customers table
-- Run this script in your Supabase project SQL editor

-- First, create a function that will generate the stable_hash_id based on customer_name and contact_number
CREATE OR REPLACE FUNCTION generate_customer_stable_hash_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate the stable_hash_id using the same formula we identified
    NEW.stable_hash_id := md5(
        LOWER(TRIM(COALESCE(NEW.customer_name, '')::TEXT)) || '::' || 
        REGEXP_REPLACE(COALESCE(NEW.contact_number, '')::TEXT, '[^0-9]', '', 'g')
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if the trigger already exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'before_customers_insert_update'
    ) THEN
        -- Create a trigger to execute this function before INSERT or UPDATE
        CREATE TRIGGER before_customers_insert_update
        BEFORE INSERT OR UPDATE ON customers
        FOR EACH ROW
        EXECUTE FUNCTION generate_customer_stable_hash_id();
        
        RAISE NOTICE 'Created trigger for automatically generating stable_hash_id on customers table';
    ELSE
        RAISE NOTICE 'Trigger for generating stable_hash_id already exists on customers table';
    END IF;
END $$;

-- Generate stable_hash_id for all existing rows that don't have one
UPDATE customers
SET stable_hash_id = md5(
    LOWER(TRIM(COALESCE(customer_name, '')::TEXT)) || '::' || 
    REGEXP_REPLACE(COALESCE(contact_number, '')::TEXT, '[^0-9]', '', 'g')
)
WHERE stable_hash_id IS NULL OR stable_hash_id = '';

-- Output a count of customers with and without hash ids
SELECT
    COUNT(*) as total_customers,
    COUNT(stable_hash_id) FILTER (WHERE stable_hash_id IS NOT NULL AND stable_hash_id != '') as customers_with_hash,
    COUNT(*) FILTER (WHERE stable_hash_id IS NULL OR stable_hash_id = '') as customers_without_hash
FROM customers; 