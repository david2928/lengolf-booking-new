-- Create crm_customer_mapping table
CREATE TABLE IF NOT EXISTS public.crm_customer_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  crm_customer_id TEXT NOT NULL,
  crm_customer_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  is_matched BOOLEAN DEFAULT false NOT NULL,
  match_method TEXT CHECK (match_method IN ('auto', 'manual')) DEFAULT 'auto',
  match_confidence REAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(profile_id, crm_customer_id)
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS crm_customer_mapping_profile_id_idx ON public.crm_customer_mapping(profile_id);
CREATE INDEX IF NOT EXISTS crm_customer_mapping_crm_customer_id_idx ON public.crm_customer_mapping(crm_customer_id);
CREATE INDEX IF NOT EXISTS crm_customer_mapping_is_matched_idx ON public.crm_customer_mapping(is_matched);

-- Enable Row Level Security
ALTER TABLE public.crm_customer_mapping ENABLE ROW LEVEL SECURITY;

-- Create policies - only admins can access this table
CREATE POLICY "Admins can do everything on crm_customer_mapping"
  ON public.crm_customer_mapping
  USING (auth.jwt() ? 'admin_access');

-- Add a trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_crm_customer_mapping_updated
  BEFORE UPDATE ON public.crm_customer_mapping
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at(); 