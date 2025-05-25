import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('[Debug Check Vars] /api/debug/check-vars/testenv1234 called');

  const envVars = process.env;

  // You can choose to filter or mask here if needed later
  return NextResponse.json(envVars);
}
