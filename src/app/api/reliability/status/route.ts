import { NextResponse } from 'next/server';
import { toolBreakers } from '@/lib/utils/reliability';

export async function GET() {
  const states: Record<string, { state: string; failures: number; lastFailure: number }> = {};
  
  for (const [name, breaker] of Object.entries(toolBreakers)) {
    states[name] = {
      state: breaker.getState(),
      failures: breaker.getFailures(),
      lastFailure: breaker.getLastFailure(),
    };
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    breakers: states
  });
}
