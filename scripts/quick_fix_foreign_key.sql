-- Quick fix for the foreign key constraint error
-- This script will modify the foreign key to use a more appropriate action

-- Option 1: Change the foreign key constraint to SET NULL
-- This means when a customer is deleted, the reference in packages will be set to NULL
BEGIN;

-- First, identify if there are any orphaned packages that would violate the constraint
SELECT COUNT(*) AS orphaned_packages_count
FROM packages p
LEFT JOIN customers c ON p.stable_hash_id = c.stable_hash_id
WHERE c.stable_hash_id IS NULL AND p.stable_hash_id IS NOT NULL;

-- Drop the existing constraint
ALTER TABLE packages DROP CONSTRAINT IF EXISTS fk_packages_customer;

-- Recreate with ON DELETE SET NULL
ALTER TABLE packages ADD CONSTRAINT fk_packages_customer
    FOREIGN KEY (stable_hash_id)
    REFERENCES customers(stable_hash_id)
    ON DELETE SET NULL;

COMMIT;

-- Option 2: Drop the constraint entirely (only if referential integrity isn't critical)
-- BEGIN;
-- ALTER TABLE packages DROP CONSTRAINT IF EXISTS fk_packages_customer;
-- COMMIT;

-- Option 3: Manually fix orphaned references before updating customers
BEGIN;

-- Identify packages that reference non-existent customers
CREATE TEMPORARY TABLE orphaned_packages AS
SELECT p.id, p.stable_hash_id
FROM packages p
LEFT JOIN customers c ON p.stable_hash_id = c.stable_hash_id
WHERE c.stable_hash_id IS NULL AND p.stable_hash_id IS NOT NULL;

-- Output count
SELECT COUNT(*) AS orphaned_packages_count FROM orphaned_packages;

-- Set orphaned references to NULL
UPDATE packages
SET stable_hash_id = NULL
WHERE id IN (SELECT id FROM orphaned_packages);

COMMIT;

-- Option 4: Ensure all packages have matching customers
-- This creates missing customer entries to maintain integrity
BEGIN;

-- Identify hashes in packages that don't exist in customers
WITH missing_hashes AS (
    SELECT DISTINCT p.stable_hash_id
    FROM packages p
    LEFT JOIN customers c ON p.stable_hash_id = c.stable_hash_id
    WHERE c.stable_hash_id IS NULL AND p.stable_hash_id IS NOT NULL
)
-- Create placeholder customer records for these missing hashes
INSERT INTO customers (customer_name, contact_number, stable_hash_id)
SELECT 
    'Unknown Customer (' || LEFT(stable_hash_id, 8) || ')', -- Use part of hash as identifier
    '', -- No contact number
    stable_hash_id
FROM missing_hashes;

-- Report how many placeholders were created
SELECT COUNT(*) AS placeholder_customers_created
FROM customers
WHERE customer_name LIKE 'Unknown Customer (%';

COMMIT; 