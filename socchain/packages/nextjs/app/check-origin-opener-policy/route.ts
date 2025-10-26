// socchain/packages/nextjs/app/check-origin-opener-policy/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  console.log('COOP GET endpoint hit'); // Optional: Check server console
  return NextResponse.json({ status: 'ok' }, {
    status: 200,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function HEAD() {
  console.log('COOP HEAD endpoint hit'); // Optional: Check server console
  return NextResponse.json(null, {
    status: 200,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Access-Control-Allow-Origin': '*',
    },
  });
}