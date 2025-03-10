-- First, remove the existing profile_id, crm_customer_id constraint
ALTER TABLE public.crm_customer_mapping
DROP CONSTRAINT IF EXISTS crm_customer_mapping_profile_id_crm_customer_id_key;

-- Create a unique constraint on profile_id
ALTER TABLE public.crm_customer_mapping
ADD CONSTRAINT crm_customer_mapping_profile_id_key UNIQUE (profile_id);

-- Add a comment explaining the change
COMMENT ON CONSTRAINT crm_customer_mapping_profile_id_key ON public.crm_customer_mapping
IS 'Ensures only one CRM mapping per profile. The CRM customer ID can change, but we maintain a 1:1 relationship between profiles and mappings.';

-- Create an index on profile_id and is_matched for common queries
CREATE INDEX IF NOT EXISTS crm_customer_mapping_profile_id_is_matched_idx
ON public.crm_customer_mapping(profile_id, is_matched);

-- Create a comment explaining the index
COMMENT ON INDEX public.crm_customer_mapping_profile_id_is_matched_idx
IS 'Optimizes queries that filter by profile_id and is_matched together, which is the common lookup pattern.'; 