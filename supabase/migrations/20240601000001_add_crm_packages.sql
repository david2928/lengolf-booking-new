-- Create crm_packages table to store package information from CRM
CREATE TABLE IF NOT EXISTS public.crm_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_package_id TEXT NOT NULL,
  crm_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  package_type_name TEXT NOT NULL,
  first_use_date DATE,
  expiration_date DATE NOT NULL,
  remaining_hours NUMERIC,
  website_id TEXT NOT NULL DEFAULT 'booking.len.golf',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(crm_package_id, website_id)
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS crm_packages_crm_customer_id_idx ON public.crm_packages(crm_customer_id);
CREATE INDEX IF NOT EXISTS crm_packages_customer_name_idx ON public.crm_packages(customer_name);
CREATE INDEX IF NOT EXISTS crm_packages_expiration_date_idx ON public.crm_packages(expiration_date);
CREATE INDEX IF NOT EXISTS crm_packages_website_id_idx ON public.crm_packages(website_id);

-- Enable Row Level Security
ALTER TABLE public.crm_packages ENABLE ROW LEVEL SECURITY;

-- Create policies - only admins can modify this table
CREATE POLICY "Admins can do everything on crm_packages"
  ON public.crm_packages
  USING (auth.jwt() ? 'admin_access');

-- Create policy for users to view their own packages
CREATE POLICY "Users can view their own packages"
  ON public.crm_packages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_customer_mapping cm
      JOIN public.profiles p ON cm.profile_id = p.id
      WHERE cm.crm_customer_id = crm_packages.crm_customer_id
      AND p.id = auth.uid()
      AND cm.is_matched = true
    )
  );

-- Add a trigger to automatically update updated_at timestamp
CREATE TRIGGER on_crm_packages_updated
  BEFORE UPDATE ON public.crm_packages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at(); 