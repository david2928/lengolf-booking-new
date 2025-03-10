-- Migration to add a trigger for automatically generating stable_hash_id in the customers table

-- First, create a function that will generate the stable_hash_id based on customer_name and contact_number
CREATE OR REPLACE FUNCTION public.generate_customer_stable_hash_id()
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

-- Make sure the stable_hash_id column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'customers' 
        AND column_name = 'stable_hash_id'
    ) THEN
        ALTER TABLE public.customers
        ADD COLUMN stable_hash_id TEXT;
    END IF;
END $$;

-- Check if the trigger already exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'before_customers_insert_update'
    ) THEN
        -- Create a trigger to execute this function before INSERT or UPDATE
        CREATE TRIGGER before_customers_insert_update
        BEFORE INSERT OR UPDATE ON public.customers
        FOR EACH ROW
        EXECUTE FUNCTION public.generate_customer_stable_hash_id();
    END IF;
END $$;

-- Update existing rows with NULL stable_hash_id
UPDATE public.customers
SET stable_hash_id = md5(
    LOWER(TRIM(COALESCE(customer_name, '')::TEXT)) || '::' || 
    REGEXP_REPLACE(COALESCE(contact_number, '')::TEXT, '[^0-9]', '', 'g')
)
WHERE stable_hash_id IS NULL OR stable_hash_id = ''; 