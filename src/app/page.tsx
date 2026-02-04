'use client';

import { useState } from 'react';
import IntentInput from '@/components/IntentInput';
import ResultsDisplay from '@/components/ResultsDisplay';
import { OrchestrationResult } from '@/lib/types';
import { Sparkles } from 'lucide-react';

export default function Home() {
  const [intent, setIntent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!intent.trim()) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intent: intent.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to process intent');
      }

      const data = await response.json();
      
      if (data.success) {
        setResult(data.result);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-center">
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium tracking-tight">Intention Engine</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-12">
        <div className="w-full max-w-3xl mx-auto">
          {/* Hero Text */}
          {!result && !isProcessing && (
            <div className="text-center mb-12 space-y-4">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                What do you want to do?
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Simply express your intent. We orchestrate the rest.
              </p>
            </div>
          )}

          {/* Input Area */}
          <IntentInput
            value={intent}
            onChange={setIntent}
            onSubmit={handleSubmit}
            isProcessing={isProcessing}
            placeholder="I'm taking Sarah to dinner Friday..."
          />

          {/* Results */}
          <ResultsDisplay result={result} isProcessing={isProcessing} />

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                {error}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-center">
          <p className="text-xs text-zinc-400">
            Powered by Z.AI GLM-4.7-flash
          </p>
        </div>
      </footer>
    </main>
  );
}
