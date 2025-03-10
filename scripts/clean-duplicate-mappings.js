require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

async function cleanupDuplicateMappings() {
  const supabase = await createSupabaseClient();
  console.log('👋 Starting duplicate CRM mapping cleanup...');
  
  try {
    // STEP 1: Find all profiles with multiple mappings
    console.log('Finding profiles with duplicate mappings...');
    
    const { data: profileCounts, error: countError } = await supabase
      .from('crm_customer_mapping')
      .select('profile_id, count(*)')
      .eq('is_matched', true)
      .group('profile_id')
      .order('count', { ascending: false });
      
    if (countError) {
      console.error('Error finding duplicate mappings:', countError);
      return;
    }
    
    // Filter to only include profiles with multiple mappings
    const profilesWithDuplicates = profileCounts.filter(p => p.count > 1);
    
    if (profilesWithDuplicates.length === 0) {
      console.log('✅ No duplicate mappings found. Database is clean!');
      return;
    }
    
    console.log(`🔍 Found ${profilesWithDuplicates.length} profiles with duplicate mappings`);
    console.table(profilesWithDuplicates);
    
    // STEP 2: Process each profile with duplicates
    for (const profile of profilesWithDuplicates) {
      const profileId = profile.profile_id;
      console.log(`\nProcessing profile: ${profileId} (${profile.count} mappings)...`);
      
      // Get all mappings for this profile
      const { data: mappings, error: mappingsError } = await supabase
        .from('crm_customer_mapping')
        .select('*')
        .eq('profile_id', profileId)
        .eq('is_matched', true)
        .order('match_confidence', { ascending: false })
        .order('updated_at', { ascending: false });
        
      if (mappingsError) {
        console.error(`Error fetching mappings for profile ${profileId}:`, mappingsError);
        continue;
      }
      
      console.log(`Found ${mappings.length} mappings for profile ${profileId}`);
      
      // Keep the best mapping (highest confidence, most recent)
      const bestMapping = mappings[0];
      console.log(`Best mapping: Customer ID ${bestMapping.crm_customer_id}, Confidence: ${bestMapping.match_confidence}, Updated: ${bestMapping.updated_at}`);
      
      // Collect IDs of mappings to delete
      const mappingsToDelete = mappings.slice(1);
      const idsToDelete = mappingsToDelete.map(m => m.id);
      
      console.log(`Will delete ${idsToDelete.length} mappings: ${idsToDelete.join(', ')}`);
      
      // Delete the duplicates
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('crm_customer_mapping')
          .delete()
          .in('id', idsToDelete);
          
        if (deleteError) {
          console.error(`Error deleting mappings for profile ${profileId}:`, deleteError);
        } else {
          console.log(`✅ Successfully cleaned up mappings for profile ${profileId}`);
        }
      }
    }
    
    console.log('\n✅ Duplicate mapping cleanup complete!');
    
  } catch (error) {
    console.error('Error in cleanup process:', error);
  }
}

// Run the cleanup function
cleanupDuplicateMappings().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 