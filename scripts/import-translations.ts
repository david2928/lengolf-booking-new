/**
 * Script to import existing translations from JSON files into the database
 * Run with: npx tsx scripts/import-translations.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function importTranslations() {
  try {
    console.log('Starting translation import...');

    // Read existing translation files
    const messagesDir = path.join(process.cwd(), 'messages');
    const enFile = path.join(messagesDir, 'en.json');
    const thFile = path.join(messagesDir, 'th.json');

    if (!fs.existsSync(enFile) || !fs.existsSync(thFile)) {
      console.error('Translation files not found');
      return;
    }

    const enTranslations = JSON.parse(fs.readFileSync(enFile, 'utf8'));
    const thTranslations = JSON.parse(fs.readFileSync(thFile, 'utf8'));

    console.log('Loaded translation files');

    // Get all namespaces from database
    const { data: namespaces, error: nsError } = await supabase
      .from('translation_namespaces')
      .select('*');

    if (nsError) {
      console.error('Error fetching namespaces:', nsError);
      return;
    }

    const namespaceMap = new Map(namespaces.map(ns => [ns.namespace, ns.id]));

    // Function to flatten nested objects
    function flattenObject(obj: any, prefix = ''): Record<string, string> {
      const result: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null) {
          Object.assign(result, flattenObject(value, newKey));
        } else {
          result[newKey] = String(value);
        }
      }
      
      return result;
    }

    // Process each namespace
    for (const [namespace, nsId] of namespaceMap) {
      console.log(`Processing namespace: ${namespace}`);

      const enNsData = enTranslations[namespace] || {};
      const thNsData = thTranslations[namespace] || {};

      const enFlat = flattenObject(enNsData);
      const thFlat = flattenObject(thNsData);

      // Get all unique keys
      const allKeys = new Set([...Object.keys(enFlat), ...Object.keys(thFlat)]);

      for (const keyPath of allKeys) {
        try {
          // Insert or update translation key
          const { data: keyData, error: keyError } = await supabase
            .from('translation_keys')
            .upsert({
              namespace_id: nsId,
              key_path: keyPath,
              description: `Translation key for ${namespace}.${keyPath}`,
              context: `Used in ${namespace} namespace`,
              is_active: true
            }, {
              onConflict: 'namespace_id,key_path'
            })
            .select()
            .single();

          if (keyError) {
            console.error(`Error upserting key ${keyPath}:`, keyError);
            continue;
          }

          const keyId = keyData.id;

          // Insert English translation if exists
          if (enFlat[keyPath]) {
            const { error: enError } = await supabase
              .from('translations')
              .upsert({
                key_id: keyId,
                locale: 'en',
                value: enFlat[keyPath],
                is_approved: false,
                updated_by: 'system-import',
                updated_at: new Date().toISOString(),
                version: 1
              }, {
                onConflict: 'key_id,locale'
              });

            if (enError) {
              console.error(`Error inserting EN translation for ${keyPath}:`, enError);
            }
          }

          // Insert Thai translation if exists
          if (thFlat[keyPath]) {
            const { error: thError } = await supabase
              .from('translations')
              .upsert({
                key_id: keyId,
                locale: 'th',
                value: thFlat[keyPath],
                is_approved: false,
                updated_by: 'system-import',
                updated_at: new Date().toISOString(),
                version: 1
              }, {
                onConflict: 'key_id,locale'
              });

            if (thError) {
              console.error(`Error inserting TH translation for ${keyPath}:`, thError);
            }
          }

          console.log(`✓ Imported ${namespace}.${keyPath}`);
        } catch (error) {
          console.error(`Error processing key ${keyPath}:`, error);
        }
      }
    }

    console.log('Translation import completed!');

    // Print summary
    const { data: keyCount } = await supabase
      .from('translation_keys')
      .select('id', { count: 'exact' });

    const { data: translationCount } = await supabase
      .from('translations')
      .select('id', { count: 'exact' });

    console.log(`\nSummary:`);
    console.log(`- Translation keys: ${keyCount?.length || 0}`);
    console.log(`- Total translations: ${translationCount?.length || 0}`);

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importTranslations();