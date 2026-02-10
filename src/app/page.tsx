'use client';

import { useState, useCallback } from 'react';

type AppState = 'IDLE' | 'THINKING' | 'RESULT';

interface OutcomeData {
  restaurant?: {
    name: string;
    address: string;
  };
  winePairing?: string;
  calendarUrl?: string;
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<OutcomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setAppState('THINKING');
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: input }],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process request');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let fullContent = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
      }

      // Parse the result from the stream
      const restaurantMatch = fullContent.match(/Restaurant:\s*([^\n]+)/i);
      const addressMatch = fullContent.match(/Address:\s*([^\n]+)/i);
      const wineMatch = fullContent.match(/Wine Pairing:\s*([^\n]+)/i);
      const urlMatch = fullContent.match(/\/api\/download-ics\?[^\s'"]+/);

      if (restaurantMatch) {
        setOutcome({
          restaurant: {
            name: restaurantMatch[1].trim(),
            address: addressMatch ? addressMatch[1].trim() : '',
          },
          winePairing: wineMatch ? wineMatch[1].trim() : '',
          calendarUrl: urlMatch ? urlMatch[0] : '',
        });
      } else {
        // Fallback: try to parse structured data from tool results
        const nameMatch = fullContent.match(/"name":\s*"([^"]+)"/);
        const addrMatch = fullContent.match(/"address":\s*"([^"]+)"/);
        const downloadMatch = fullContent.match(/"downloadUrl":\s*"([^"]+)"/);
        
        if (nameMatch) {
          setOutcome({
            restaurant: {
              name: nameMatch[1],
              address: addrMatch ? addrMatch[1] : '',
            },
            winePairing: '',
            calendarUrl: downloadMatch ? downloadMatch[1] : '',
          });
        } else {
          setError('Could not parse result');
        }
      }

      setAppState('RESULT');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setAppState('RESULT');
    }
  }, [input]);

  const reset = () => {
    setAppState('IDLE');
    setOutcome(null);
    setError(null);
    setInput('');
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-8">
      {appState === 'IDLE' && (
        <form onSubmit={handleSubmit} className="w-full max-w-4xl">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Book Italian dinner in San Francisco tomorrow at 7pm"
            className="w-full bg-transparent text-6xl font-extralight text-center placeholder-neutral-600 focus:outline-none focus:placeholder-neutral-500 transition-colors"
            autoFocus
          />
        </form>
      )}

      {appState === 'THINKING' && (
        <div className="w-full max-w-4xl flex flex-col items-center">
          <div className="w-4 h-4 bg-neutral-100 rounded-full animate-pulse mb-8" />
          <p className="text-2xl font-extralight text-neutral-400">
            {input}
          </p>
        </div>
      )}

      {appState === 'RESULT' && outcome && (
        <div className="w-full max-w-2xl">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-6">
            <div>
              <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Restaurant</h2>
              <p className="text-3xl font-light">{outcome.restaurant?.name}</p>
              <p className="text-lg text-neutral-400 mt-1">{outcome.restaurant?.address}</p>
            </div>

            {outcome.winePairing && (
              <div>
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Wine Pairing</h2>
                <p className="text-lg text-neutral-300">{outcome.winePairing}</p>
              </div>
            )}

            {outcome.calendarUrl && (
              <a
                href={outcome.calendarUrl}
                className="block w-full bg-neutral-100 text-neutral-950 text-center py-4 rounded-xl font-medium hover:bg-white transition-colors"
              >
                Finalize & Download (.ics)
              </a>
            )}

            <button
              onClick={reset}
              className="w-full text-neutral-500 hover:text-neutral-300 transition-colors text-sm"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {appState === 'RESULT' && (error || !outcome) && (
        <div className="text-center">
          <p className="text-xl text-neutral-400 mb-4">{error || 'Something went wrong'}</p>
          <button
            onClick={reset}
            className="text-neutral-100 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
