-- Drop existing objects
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_profile_updated();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.profiles;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE,
  line_id TEXT,
  display_name TEXT,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  picture_url TEXT,
  provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE(line_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Function to handle user profile updates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _raw_meta jsonb;
  _display_name text;
  _name text;
  _picture_url text;
  _provider text;
  _email text;
BEGIN
  -- Get the raw user metadata
  _raw_meta := NEW.raw_user_meta_data;
  RAISE LOG 'Creating user profile with metadata: %', _raw_meta;

  -- Only create profile for non-guest users
  IF NEW.email NOT LIKE '%@guest.user' THEN
    -- For LINE users, include LINE-specific data
    IF NEW.email LIKE '%@line.user' THEN
      _display_name := _raw_meta->>'name';
      _name := _raw_meta->>'name';
      _picture_url := _raw_meta->>'avatar_url';
      _provider := 'line';
      _email := NULL; -- Will be updated later when user provides it

      INSERT INTO public.profiles (
        id,
        line_id,
        display_name,
        name,
        email,
        picture_url,
        provider,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        _raw_meta->>'line_id',
        _display_name,
        _name,
        _email,
        _picture_url,
        _provider,
        NOW(),
        NOW()
      );
      
      RAISE LOG 'Created LINE profile with name: % and picture: %', _display_name, _picture_url;
    ELSE
      -- For other providers
      _display_name := COALESCE(
        _raw_meta->>'name',
        _raw_meta->>'full_name',
        'Unknown User'
      );
      _name := _display_name;
      _picture_url := _raw_meta->>'avatar_url';
      _provider := _raw_meta->>'provider';
      _email := NEW.email;

      INSERT INTO public.profiles (
        id,
        display_name,
        name,
        email,
        picture_url,
        provider,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        _display_name,
        _name,
        _email,
        _picture_url,
        _provider,
        NOW(),
        NOW()
      );
      
      RAISE LOG 'Created profile for provider % with name: %', _provider, _display_name;
    END IF;
  ELSE
    RAISE LOG 'Skipping profile creation for guest user';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle profile updates
CREATE OR REPLACE FUNCTION public.handle_profile_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_updated(); 