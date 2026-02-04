'use client';

import { OrchestrationResult } from '@/lib/types';
import OutcomeCard from './OutcomeCard';
import { Sparkles } from 'lucide-react';

interface ResultsDisplayProps {
  result: OrchestrationResult | null;
  isProcessing: boolean;
}

export default function ResultsDisplay({ result, isProcessing }: ResultsDisplayProps) {
  if (!result && !isProcessing) {
    return null;
  }

  const orchestration = result?.orchestration;
  const actions = orchestration?.actions || [];

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 space-y-6">
      {isProcessing && !result && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 py-12">
            <Sparkles className="w-5 h-5 text-zinc-400 animate-pulse" />
            <span className="text-sm text-zinc-400">Orchestrating your intent...</span>
          </div>
          
          {/* Skeleton cards */}
          {[1, 2, 3].map((i) => (
            <div 
              key={i}
              className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      )}
      
      {orchestration && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="text-center space-y-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Intent: <span className="text-zinc-900 dark:text-zinc-100">{orchestration.intent}</span>
            </p>
            <p className="text-xs text-zinc-400">
              Confidence: {Math.round(orchestration.confidence * 100)}%
            </p>
          </div>
          
          {/* Outcome Cards */}
          <div className="space-y-3">
            {actions.map((action, index) => (
              <OutcomeCard key={index} action={action} index={index} />
            ))}
          </div>
          
          {/* Summary Text */}
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {orchestration.summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
