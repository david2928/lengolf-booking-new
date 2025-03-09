-- Script to test the customer hash trigger
-- Run this in your Supabase SQL editor after adding the trigger

-- First, let's create a test customer
INSERT INTO customers (customer_name, contact_number) 
VALUES ('Test Customer', '123-456-7890');

-- Check if the stable_hash_id was automatically generated
SELECT customer_name, contact_number, stable_hash_id 
FROM customers
WHERE customer_name = 'Test Customer';

-- Calculate the expected hash manually to verify
SELECT md5(
    LOWER(TRIM('Test Customer'::TEXT)) || '::' || 
    REGEXP_REPLACE('123-456-7890'::TEXT, '[^0-9]', '', 'g')
) AS expected_hash;

-- Update the customer to test if the trigger works on updates
UPDATE customers
SET customer_name = 'Test Customer Updated'
WHERE customer_name = 'Test Customer';

-- Check if the stable_hash_id was updated correctly
SELECT customer_name, contact_number, stable_hash_id 
FROM customers
WHERE customer_name = 'Test Customer Updated';

-- Calculate the expected hash after update
SELECT md5(
    LOWER(TRIM('Test Customer Updated'::TEXT)) || '::' || 
    REGEXP_REPLACE('123-456-7890'::TEXT, '[^0-9]', '', 'g')
) AS expected_hash_after_update;

-- Clean up (optional)
DELETE FROM customers WHERE customer_name = 'Test Customer Updated'; 