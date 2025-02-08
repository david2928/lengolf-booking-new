import { createClient } from '@/lib/supabase/client';

const GUEST_EMAIL = 'guest@lengolf.com';
const GUEST_PASSWORD = process.env.NEXT_PUBLIC_GUEST_PASSWORD || 'guest123';

export const signInAsGuest = async () => {
  const supabase = createClient();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: GUEST_EMAIL,
    password: GUEST_PASSWORD,
  });

  if (error) {
    throw new Error('Guest login failed: ' + error.message);
  }

  return data;
}; 