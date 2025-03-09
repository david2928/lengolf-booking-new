-- Direct SQL query to update stable_hash_id for all packages
-- This can be run directly without creating functions or triggers

-- First, make sure the stable_hash_id column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'packages' 
        AND column_name = 'stable_hash_id'
    ) THEN
        ALTER TABLE public.packages
        ADD COLUMN stable_hash_id TEXT;
    END IF;
END $$;

-- Update all packages with stable_hash_id using a single SQL statement
UPDATE packages
SET stable_hash_id = 
    CASE
        -- When the name contains a phone number in parentheses (capturing the last one)
        WHEN customer_name ~ '\((\d+)\)[^\(]*$' THEN
            md5(
                LOWER(TRIM(
                    -- Extract name (everything before the last phone parentheses)
                    regexp_replace(customer_name, '\s*\(\d+\)[^\(]*$', '')
                )) || '::' || 
                -- Extract phone and clean it (the last number in parentheses)
                regexp_replace(
                    (regexp_match(customer_name, '\((\d+)\)[^\(]*$'))[1], 
                    '[^0-9]', '', 'g'
                )
            )
        -- When there's no phone in parentheses
        ELSE
            md5(LOWER(TRIM(customer_name)) || '::')
    END
WHERE stable_hash_id IS NULL OR stable_hash_id = '';

-- Output a sample of packages with their generated hash IDs
SELECT 
    customer_name,
    stable_hash_id,
    -- For verification: extract name component
    regexp_replace(customer_name, '\s*\(\d+\)[^\(]*$', '') AS extracted_name,
    -- For verification: extract phone component (if present)
    CASE
        WHEN customer_name ~ '\((\d+)\)[^\(]*$' THEN 
            (regexp_match(customer_name, '\((\d+)\)[^\(]*$'))[1]
        ELSE 
            NULL
    END AS extracted_phone
FROM packages
LIMIT 10; 