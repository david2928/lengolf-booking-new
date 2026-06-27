import { NextResponse } from 'next/server';

const UPSTREAM =
  process.env.PRICING_API_UPSTREAM_URL ||
  'https://lengolf-forms.vercel.app/api/pricing';

export const revalidate = 1800; // cache 30 min at the edge

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, { next: { revalidate: 1800 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream pricing API responded ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[/api/pricing] fetch failed:', err);
    return NextResponse.json({ error: 'Pricing unavailable' }, { status: 502 });
  }
}
