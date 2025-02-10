-- Update auth settings to disable email confirmation for LINE users
ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- Create a trigger to auto-confirm emails for LINE users
CREATE OR REPLACE FUNCTION public.handle_line_user_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email LIKE '%@line.user' THEN
    NEW.email_confirmed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_email ON auth.users;
CREATE TRIGGER on_auth_user_created_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_line_user_email(); 