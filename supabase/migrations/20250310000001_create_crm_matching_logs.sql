CREATE TABLE public.crm_matching_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  request_id TEXT,
  profile_id TEXT,
  stable_hash_id TEXT,
  crm_customer_id TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX crm_matching_logs_created_at_idx ON public.crm_matching_logs(created_at);
CREATE INDEX crm_matching_logs_profile_id_idx ON public.crm_matching_logs(profile_id);
CREATE INDEX crm_matching_logs_stable_hash_id_idx ON public.crm_matching_logs(stable_hash_id);
CREATE INDEX crm_matching_logs_level_idx ON public.crm_matching_logs(level); 