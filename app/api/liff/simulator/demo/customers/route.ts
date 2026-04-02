import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (supabase as any).schema('simulator');

    // Get customer IDs that have simulator data (rounds or range sessions)
    const [roundCustomers, rangeCustomers] = await Promise.all([
      sim
        .from('simulator_round_scores')
        .select('customer_id')
        .not('customer_id', 'is', null),
      sim
        .from('range_sessions')
        .select('customer_id')
        .not('customer_id', 'is', null),
    ]);

    if (roundCustomers.error) {
      console.error('[Demo Customers] Round scores query error:', roundCustomers.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (rangeCustomers.error) {
      console.error('[Demo Customers] Range sessions query error:', rangeCustomers.error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Combine and deduplicate customer IDs
    const allIds = new Set<string>();
    for (const row of (roundCustomers.data || [])) {
      if (row.customer_id) allIds.add(row.customer_id);
    }
    for (const row of (rangeCustomers.data || [])) {
      if (row.customer_id) allIds.add(row.customer_id);
    }

    const customerIds = [...allIds];

    if (customerIds.length === 0) {
      return NextResponse.json({ customers: [] });
    }

    // Fetch customer names from the customers table
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, customer_name')
      .in('id', customerIds)
      .order('customer_name', { ascending: true });

    if (customersError) {
      console.error('[Demo Customers] Customers query error:', customersError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      customers: (customers || []).map((c: { id: string; customer_name: string }) => ({
        id: c.id,
        name: c.customer_name,
      })),
    });
  } catch (error) {
    console.error('[Demo Customers] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
