import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // TODO: Re-enable authentication before production deployment
    // Currently disabled for feature branch development
    
    console.log('Admin translations API called');
    
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace');
    const search = searchParams.get('search');
    const reviewFilter = searchParams.get('reviewFilter');
    
    console.log('Query params:', { namespace, search, reviewFilter });
    
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing environment variables');
      return NextResponse.json({ 
        error: 'Server configuration error: Missing Supabase credentials' 
      }, { status: 500 });
    }
    
    // Use service role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    console.log('Supabase client created with service role');

    // Build the query for translation keys with their translations
    let query = supabase
      .from('translation_keys')
      .select(`
        id,
        key_path,
        context,
        namespace:translation_namespaces(namespace),
        translations(
          id,
          locale,
          value,
          is_approved,
          updated_at,
          updated_by,
          version
        )
      `)
      .order('key_path');

    // Apply namespace filter
    if (namespace && namespace !== 'all') {
      query = query.eq('namespace.namespace', namespace);
    }

    // Apply search filter
    if (search) {
      query = query.or(`key_path.ilike.%${search}%,context.ilike.%${search}%`);
    }

    const { data: translationKeys, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Apply review filter if specified
    let filteredKeys = translationKeys || [];
    if (reviewFilter && reviewFilter !== 'all') {
      filteredKeys = translationKeys?.filter(key => {
        const hasApproved = key.translations.some((t: any) => t.is_approved);
        const hasUnapproved = key.translations.some((t: any) => !t.is_approved);
        
        switch (reviewFilter) {
          case 'approved':
            return hasApproved && !hasUnapproved;
          case 'pending':
            return hasUnapproved;
          case 'mixed':
            return hasApproved && hasUnapproved;
          default:
            return true;
        }
      }) || [];
    }

    return NextResponse.json({
      success: true,
      translations: filteredKeys
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // TODO: Re-enable authentication before production deployment
    // Currently disabled for feature branch development
    
    const { keyId, locale, value, reason } = await request.json();
    
    if (!keyId || !locale || value === undefined) {
      return NextResponse.json({ 
        error: 'Missing required fields: keyId, locale, and value are required' 
      }, { status: 400 });
    }

    // Use service role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Convert keyId to number if it's a string
    const numericKeyId = typeof keyId === 'string' ? parseInt(keyId, 10) : keyId;
    
    if (isNaN(numericKeyId)) {
      return NextResponse.json({ 
        error: 'Invalid keyId: must be a valid number' 
      }, { status: 400 });
    }

    // Get current translation to increment version
    const { data: currentTranslation } = await supabase
      .from('translations')
      .select('version')
      .eq('key_id', numericKeyId)
      .eq('locale', locale)
      .single();

    const nextVersion = (currentTranslation?.version || 0) + 1;

    // Update the translation
    const { error: updateError } = await supabase
      .from('translations')
      .upsert({
        key_id: numericKeyId,
        locale,
        value,
        is_approved: true, // Auto-approve edits as per workflow
        updated_by: 'admin-panel', // TODO: Use actual user when auth is enabled
        updated_at: new Date().toISOString(),
        version: nextVersion
      }, {
        onConflict: 'key_id,locale'
      });

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Translation updated successfully'
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}