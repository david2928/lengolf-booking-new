/**
 * Simple script to export translations from database to JSON files
 * Run with: node scripts/export-translations-simple.js
 * 
 * This will export all approved translations and overwrite the messages/*.json files
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables in .env.local');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function exportTranslations() {
  try {
    console.log('🚀 Starting translation export...');

    // Fetch all translations (regardless of approval status)
    const { data: translations, error } = await supabase
      .from('translation_keys')
      .select(`
        key_path,
        namespace:translation_namespaces(namespace),
        translations!inner(locale, value, is_approved)
      `)
      .eq('is_active', true);

    if (error) {
      console.error('❌ Database error:', error);
      return;
    }

    console.log(`📄 Found ${translations?.length || 0} translation keys`);

    // Group by locale and namespace
    const translationsByLocale = {};

    translations?.forEach((item) => {
      item.translations.forEach((translation) => {
        const { locale, value } = translation;
        const namespace = item.namespace.namespace;
        
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

    // Write to JSON files
    const messagesDir = path.join(process.cwd(), 'messages');
    
    // Ensure messages directory exists
    if (!fs.existsSync(messagesDir)) {
      fs.mkdirSync(messagesDir, { recursive: true });
      console.log('📁 Created messages directory');
    }

    let exportedCount = 0;
    Object.entries(translationsByLocale).forEach(([locale, namespaces]) => {
      const content = JSON.stringify(namespaces, null, 2);
      const filePath = path.join(messagesDir, `${locale}.json`);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Exported ${locale}.json`);
      exportedCount++;
    });

    console.log('');
    console.log('🎉 Export completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Locales exported: ${exportedCount}`);
    console.log(`   - Translation keys: ${translations?.length || 0}`);
    console.log(`   - Total translations: ${translations?.reduce((sum, item) => sum + item.translations.length, 0) || 0}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Review the exported files in the messages/ directory');
    console.log('   2. Test your application to ensure translations work correctly');
    console.log('   3. Commit the changes and redeploy your application');

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// Run the export
exportTranslations();