import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

// Helper function to check if user is admin
function isAdmin(user: any): boolean {
  const allowedEmails = ['admin@lengolf.com', 'dgeiermann@gmail.com']; // Add your Gmail here
  return allowedEmails.includes(user?.email);
}

export async function POST(request: NextRequest) {
  try {
    // TODO: Re-enable authentication before production deployment
    // Currently disabled for feature branch development
    
    // const session = await getServerSession(authOptions);
    // if (!session || !isAdmin(session.user)) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const supabase = createServerClient();

    // Simply approve all pending translations
    const { data: updated, error: approveError } = await supabase
      .from('translations')
      .update({ is_approved: true })
      .eq('is_approved', false)
      .select('id');

    if (approveError) {
      console.error('Error approving translations:', approveError);
      return NextResponse.json({ error: 'Failed to approve translations' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Approved ${updated?.length || 0} pending translations`,
      note: 'Use the local export script to generate JSON files: node scripts/export-translations-simple.js'
    });

  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}