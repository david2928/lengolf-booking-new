-- Script to test the package hash trigger
-- Run this in your Supabase SQL editor after adding the trigger

-- Create a test function to extract name and phone for testing purposes
CREATE OR REPLACE FUNCTION test_extract_name_phone(customer_name_str TEXT)
RETURNS TABLE(name_part TEXT, phone_part TEXT) AS $$
DECLARE
    phone_match TEXT[];
    name_result TEXT;
    phone_result TEXT;
BEGIN
    -- Try to extract phone from the last parentheses in the name
    SELECT regexp_match(customer_name_str, '\((\d+)\)[^\(]*$') INTO phone_match;
    
    IF phone_match IS NOT NULL THEN
        -- Extract the phone number
        phone_result := phone_match[1];
        
        -- Extract the name part (everything before the phone parentheses)
        name_result := regexp_replace(customer_name_str, '\s*\(\d+\)[^\(]*$', '');
    ELSE
        -- If no phone found, use the whole name
        name_result := customer_name_str;
        phone_result := '';
    END IF;
    
    RETURN QUERY SELECT name_result, phone_result;
END;
$$ LANGUAGE plpgsql;

-- Test some sample data to verify the extraction works correctly
SELECT 
    test_name_phone.customer_name,
    extract_result.name_part,
    extract_result.phone_part,
    md5(
        LOWER(TRIM(extract_result.name_part)) || '::' || 
        REGEXP_REPLACE(extract_result.phone_part, '[^0-9]', '', 'g')
    ) AS calculated_hash,
    test_name_phone.stable_hash_id AS existing_hash,
    (md5(
        LOWER(TRIM(extract_result.name_part)) || '::' || 
        REGEXP_REPLACE(extract_result.phone_part, '[^0-9]', '', 'g')
    ) = test_name_phone.stable_hash_id) AS hash_matches
FROM 
    (VALUES 
        ('Meam  (Thai)  (826651424)', '5074165dd7b64091711ae40c7761fa7f'),
        ('Teera Jungthirapanich (819116699)', 'aa01b4f77f574752678f123c3b687f11'),
        ('Michael  Wong (Hongkong) (917848886)', 'd55921d72673635e556bb15b16d2c9d5'),
        ('Htoo Myat Naing (634966401)', 'cf6de047992787bec02f82ae0e2fb17d'),
        ('Kevin (china) (940343040)', 'eae42c0aaf5eadd5c58aa6f05842c463')
    ) AS test_name_phone(customer_name, stable_hash_id),
    LATERAL test_extract_name_phone(test_name_phone.customer_name) AS extract_result;

-- Insert a test package
INSERT INTO packages (customer_name) 
VALUES ('Test Customer (123456789)');

-- Verify the hash was generated automatically
SELECT 
    customer_name,
    stable_hash_id,
    (SELECT name_part FROM test_extract_name_phone(customer_name)) AS extracted_name,
    (SELECT phone_part FROM test_extract_name_phone(customer_name)) AS extracted_phone,
    md5(
        LOWER(TRIM((SELECT name_part FROM test_extract_name_phone(customer_name)))) || '::' || 
        REGEXP_REPLACE((SELECT phone_part FROM test_extract_name_phone(customer_name)), '[^0-9]', '', 'g')
    ) AS expected_hash
FROM packages
WHERE customer_name = 'Test Customer (123456789)';

-- Update the package to test trigger on update
UPDATE packages
SET customer_name = 'Test Customer Updated (123456789)'
WHERE customer_name = 'Test Customer (123456789)';

-- Verify the hash was updated
SELECT 
    customer_name,
    stable_hash_id,
    (SELECT name_part FROM test_extract_name_phone(customer_name)) AS extracted_name,
    (SELECT phone_part FROM test_extract_name_phone(customer_name)) AS extracted_phone,
    md5(
        LOWER(TRIM((SELECT name_part FROM test_extract_name_phone(customer_name)))) || '::' || 
        REGEXP_REPLACE((SELECT phone_part FROM test_extract_name_phone(customer_name)), '[^0-9]', '', 'g')
    ) AS expected_hash
FROM packages
WHERE customer_name = 'Test Customer Updated (123456789)';

-- Clean up test data
DELETE FROM packages WHERE customer_name = 'Test Customer Updated (123456789)';
DROP FUNCTION test_extract_name_phone; 