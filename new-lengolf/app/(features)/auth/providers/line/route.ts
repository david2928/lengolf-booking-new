import { NextResponse } from 'next/server'
import { debug } from '@/lib/debug'

export async function POST() {
  debug.log('LINE OAuth not implemented yet')
  return NextResponse.redirect(
    new URL('/auth/login?error=not_implemented&error_description=LINE login is not available yet', process.env.NEXT_PUBLIC_APP_URL!)
  )
} 