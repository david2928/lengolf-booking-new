import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/options';

// Helper function to check if user is admin
function isAdmin(user: any): boolean {
  const adminEmails = ['admin@lengolf.com', 'dgeiermann@gmail.com'];
  return adminEmails.includes(user?.email);
}

export async function GET(request: NextRequest) {
  try {
    // TODO: Re-enable authentication before production deployment
    // Currently disabled for feature branch development
    
    // const session = await getServerSession(authOptions);
    // if (!session || !isAdmin(session.user)) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Use service role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch all approved translations
    const { data: translations, error } = await supabase
      .from('translation_keys')
      .select(`
        key_path,
        namespace:translation_namespaces(namespace),
        translations!inner(locale, value, is_approved)
      `)
      .eq('translations.is_approved', true)
      .eq('is_active', true);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by locale and namespace
    const translationsByLocale: Record<string, Record<string, any>> = {};

    translations?.forEach((item) => {
      item.translations.forEach((translation: any) => {
        const { locale, value } = translation;
        const namespace = (item.namespace as any)?.namespace;
        
        if (!translationsByLocale[locale]) {
          translationsByLocale[locale] = {};
        }
        
        if (!translationsByLocale[locale][namespace]) {
          translationsByLocale[locale][namespace] = {};
        }

        // Handle nested keys (e.g., "errors.required" -> { errors: { required: "..." } })
        const keyParts = item.key_path.split('.');
        let current = translationsByLocale[locale][namespace];
        
        for (let i = 0; i < keyParts.length - 1; i++) {
          if (!current[keyParts[i]]) {
            current[keyParts[i]] = {};
          }
          current = current[keyParts[i]];
        }
        
        current[keyParts[keyParts.length - 1]] = value;
      });
    });

    // Create ZIP file content simulation (we'll just return JSON for now)
    const files: Record<string, string> = {};
    
    Object.entries(translationsByLocale).forEach(([locale, namespaces]) => {
      const content = JSON.stringify(namespaces, null, 2);
      files[`${locale}.json`] = content;
    });

    // For now, we'll return the English and Thai JSON files as a simple download
    // In a real implementation, you might want to use a ZIP library
    const enContent = files['en.json'] || '{}';
    const thContent = files['th.json'] || '{}';

    // Return as a downloadable file (for now just returning the English translations)
    return new NextResponse(enContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="translations-export.json"',
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}