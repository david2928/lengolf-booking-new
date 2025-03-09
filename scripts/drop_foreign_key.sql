-- Simple script to drop the foreign key constraint between packages and customers

BEGIN;

-- Drop the existing constraint
ALTER TABLE packages DROP CONSTRAINT IF EXISTS fk_packages_customer;

COMMIT;

-- Verify the constraint has been removed
SELECT conname, contype, conrelid::regclass AS table_name, confrelid::regclass AS reference
FROM pg_constraint
WHERE conname = 'fk_packages_customer';

-- Now you should be able to truncate or delete from customers without constraint errors 