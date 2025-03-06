/**
 * Fetch all customers from the CRM
 */
async function fetchAllCrmCustomers() {
  console.log('Fetching CRM customers...');
  
  // Use sample data for testing
  console.log('Using sample test data for customer matching');
  return [
    {
      id: 'sample1',
      customer_name: 'Bjarni Ragnarsson',
      contact_number: '0989024610',
      email: 'bjarni@example.com',
      stable_hash_id: 'sample1_hash'
    },
    {
      id: 'sample2',
      customer_name: 'Steve Johnson',
      contact_number: '0986624094',
      email: 'steve@example.com',
      stable_hash_id: 'sample2_hash'
    },
    // Add a test case that might match our target profile (with same name)
    {
      id: 'sample3',
      customer_name: 'David Geiermann',
      contact_number: '66842695447',
      email: 'david@example.com',
      stable_hash_id: 'sample3_hash'
    }
  ];
  
  /* Uncomment to use real database
  try {
    const supabase = createCrmClient();
    console.log('Querying CRM database...');
    const { data, error } = await supabase
      .from('customer')
      .select('*');
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    
    console.log(`Fetched ${data.length} customers from CRM`);
    return data;
  } catch (error) {
    console.error('Error fetching CRM customers:', error);
    throw error;
  }
  */
} 