import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  
  // Return if code is not available
  if (!code) {
    return new NextResponse('No code provided', { status: 400 })
  }

  const supabase = createClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return new NextResponse(error.message, { status: 400 })
  }

  return NextResponse.redirect(new URL('/', request.url))
} 