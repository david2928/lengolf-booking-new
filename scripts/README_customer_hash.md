# Customer Stable Hash ID Implementation

This directory contains scripts to implement and maintain the `stable_hash_id` column for the customers table in your Supabase project.

## What is stable_hash_id?

The `stable_hash_id` is an MD5 hash generated from a customer's name and contact number, providing a consistent identifier even when the CRM data is refreshed or truncated. It's used to:

- Maintain relationships between customers and other data
- Allow for consistent lookup of customer records even after reimporting data
- Enable matching between different systems using the same hash algorithm

## Hash Generation Formula

The `stable_hash_id` is generated using this formula:

```sql
md5(
    LOWER(TRIM(customer_name)) || '::' || 
    REGEXP_REPLACE(contact_number, '[^0-9]', '', 'g')
)
```

This formula:
1. Takes the customer name, converts it to lowercase, and trims whitespace
2. Adds a separator "::" 
3. Takes the contact number and removes any non-numeric characters
4. Generates an MD5 hash from this combined string

## Available Scripts

### 1. add_customers_hash_trigger.sql

This script:
- Creates a function to generate the `stable_hash_id`
- Adds a trigger that automatically sets/updates the `stable_hash_id` whenever a customer record is inserted or updated
- Updates any existing records that don't have a `stable_hash_id`

Run this script directly in your Supabase SQL editor or locally using the Supabase CLI.

### 2. Migration File

A migration file is also available in:
```
supabase/migrations/20240500000001_add_customer_hash_trigger.sql
```

This migration:
- Creates the hash generation function
- Ensures the `stable_hash_id` column exists
- Sets up the trigger
- Updates existing records

To apply this migration:

```bash
supabase migration up
```

## Common Scenarios

### Importing New Data From CRM

When importing new data, the trigger will automatically generate the `stable_hash_id` for each new record.

If your import process involves:
1. Truncating the table first: `TRUNCATE TABLE customers;`
2. Then inserting new data: `INSERT INTO customers (...) VALUES (...);`

The trigger will generate the hash for each new record as it's inserted.

### Manual Testing

To manually test that the trigger is working:

```sql
INSERT INTO customers (customer_name, contact_number) 
VALUES ('Test Customer', '123-456-7890');

-- Verify the stable_hash_id was generated
SELECT customer_name, contact_number, stable_hash_id 
FROM customers
WHERE customer_name = 'Test Customer';
```

## Troubleshooting

If you find records without a `stable_hash_id`, you can run:

```sql
UPDATE customers
SET stable_hash_id = md5(
    LOWER(TRIM(COALESCE(customer_name, '')::TEXT)) || '::' || 
    REGEXP_REPLACE(COALESCE(contact_number, '')::TEXT, '[^0-9]', '', 'g')
)
WHERE stable_hash_id IS NULL OR stable_hash_id = '';
``` 