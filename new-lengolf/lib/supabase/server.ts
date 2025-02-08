import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/app/types/supabase'

export const createClient = () => {
  return createRouteHandlerClient<Database>({ cookies })
} 