-- Safe CRM Update Procedure
-- This procedure can be used to update customer data from your CRM system
-- while maintaining referential integrity with the packages table

-- Create a function to handle updating CRM data
CREATE OR REPLACE FUNCTION public.safe_crm_update()
RETURNS void AS $$
BEGIN
    -- Step 1: Create a temporary table to hold the new customer data
    CREATE TEMPORARY TABLE temp_customers (
        id SERIAL,
        customer_name TEXT,
        contact_number TEXT,
        -- Add all other customer columns here
        stable_hash_id TEXT
    ) ON COMMIT DROP;
    
    -- Step 2: Import your data into the temp table
    -- You'll need to replace this with your actual import process
    -- INSERT INTO temp_customers (...) VALUES (...);
    
    -- Step 3: Generate the stable_hash_id for the new data
    UPDATE temp_customers
    SET stable_hash_id = md5(
        LOWER(TRIM(COALESCE(customer_name, '')::TEXT)) || '::' || 
        REGEXP_REPLACE(COALESCE(contact_number, '')::TEXT, '[^0-9]', '', 'g')
    )
    WHERE stable_hash_id IS NULL OR stable_hash_id = '';
    
    -- Step 4: Identify packages that reference customers that will be removed
    CREATE TEMPORARY TABLE orphaned_packages AS
    SELECT p.id, p.stable_hash_id
    FROM packages p
    LEFT JOIN temp_customers tc ON p.stable_hash_id = tc.stable_hash_id
    WHERE tc.stable_hash_id IS NULL
    AND EXISTS (SELECT 1 FROM customers c WHERE c.stable_hash_id = p.stable_hash_id);
    
    -- Step 5: Begin transaction to ensure atomicity
    BEGIN;
    
    -- Step 6: Update instead of Delete+Insert to preserve referential integrity
    -- First, disable the trigger temporarily to avoid rehashing
    ALTER TABLE customers DISABLE TRIGGER IF EXISTS before_customers_insert_update;
    
    -- Delete customers that aren't in the new data and don't have package references
    DELETE FROM customers c
    WHERE NOT EXISTS (SELECT 1 FROM temp_customers tc WHERE tc.stable_hash_id = c.stable_hash_id)
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.stable_hash_id = c.stable_hash_id);
    
    -- For each row in temp_customers
    -- If it exists in customers, update it
    -- If it doesn't exist, insert it
    MERGE INTO customers c
    USING temp_customers tc ON (c.stable_hash_id = tc.stable_hash_id)
    WHEN MATCHED THEN
        UPDATE SET 
            customer_name = tc.customer_name,
            contact_number = tc.contact_number
            -- Update other columns as needed
    WHEN NOT MATCHED THEN
        INSERT (
            customer_name, 
            contact_number,
            -- Other columns
            stable_hash_id
        )
        VALUES (
            tc.customer_name, 
            tc.contact_number,
            -- Other values
            tc.stable_hash_id
        );
    
    -- Re-enable the trigger
    ALTER TABLE customers ENABLE TRIGGER IF EXISTS before_customers_insert_update;
    
    -- Step 7: Commit transaction
    COMMIT;
    
    -- Return info about orphaned packages that may need attention
    RAISE NOTICE 'CRM update completed. % orphaned packages found that reference customers no longer in CRM.',
        (SELECT COUNT(*) FROM orphaned_packages);
END;
$$ LANGUAGE plpgsql;

-- To use this function, you would:
-- 1. Import data to temp_customers table
-- 2. Call: SELECT public.safe_crm_update();

-- Alternative approach if you really need to truncate:
-- This function will temporarily modify the foreign key to allow truncate

CREATE OR REPLACE FUNCTION public.truncate_and_reload_customers()
RETURNS void AS $$
BEGIN
    -- Step 1: Begin transaction
    BEGIN;
    
    -- Step 2: Drop the foreign key constraint temporarily
    ALTER TABLE packages DROP CONSTRAINT IF EXISTS fk_packages_customer;
    
    -- Step 3: Truncate the customers table
    TRUNCATE TABLE customers;
    
    -- Step 4: Import your data
    -- INSERT INTO customers (...) VALUES (...);
    
    -- Step 5: Generate stable_hash_id for new data
    UPDATE customers
    SET stable_hash_id = md5(
        LOWER(TRIM(COALESCE(customer_name, '')::TEXT)) || '::' || 
        REGEXP_REPLACE(COALESCE(contact_number, '')::TEXT, '[^0-9]', '', 'g')
    )
    WHERE stable_hash_id IS NULL OR stable_hash_id = '';
    
    -- Step 6: Identify orphaned packages
    CREATE TEMPORARY TABLE orphaned_packages AS
    SELECT p.id, p.stable_hash_id
    FROM packages p
    LEFT JOIN customers c ON p.stable_hash_id = c.stable_hash_id
    WHERE c.stable_hash_id IS NULL;
    
    -- Step 7: Recreate the foreign key constraint
    ALTER TABLE packages ADD CONSTRAINT fk_packages_customer
        FOREIGN KEY (stable_hash_id)
        REFERENCES customers(stable_hash_id)
        -- Consider using ON DELETE SET NULL if appropriate
        ON DELETE RESTRICT;
    
    -- Step 8: Commit transaction
    COMMIT;
    
    -- Return info about orphaned packages
    RAISE NOTICE 'Customers reloaded. % orphaned packages found that reference non-existent customers.',
        (SELECT COUNT(*) FROM orphaned_packages);
END;
$$ LANGUAGE plpgsql;

-- If you need to modify your Python code that's calling the Supabase API
-- Here's a safer approach (pseudocode):
/*
def push_to_supabase():
    # Instead of:
    # supabase.table('customers').delete().neq('id', 0).execute()
    
    # Upload new data to a temporary table first
    supabase.table('temp_customers').insert([...]).execute()
    
    # Then call the safe update function
    supabase.rpc('safe_crm_update').execute()
    
    # Or if you really need to use truncate:
    supabase.rpc('truncate_and_reload_customers').execute()
*/ 