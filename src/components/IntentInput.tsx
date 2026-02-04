'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface IntentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  placeholder?: string;
}

export default function IntentInput({ 
  value, 
  onChange, 
  onSubmit, 
  isProcessing,
  placeholder = "What's your intention?" 
}: IntentInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayText, setDisplayText] = useState(value);

  useEffect(() => {
    setDisplayText(value);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div 
        className={`
          relative group transition-all duration-500 ease-out
          ${isProcessing ? 'animate-pulse-slow' : ''}
        `}
      >
        <div 
          className={`
            absolute inset-0 rounded-2xl transition-all duration-500
            ${isFocused 
              ? 'bg-zinc-200 dark:bg-zinc-800 scale-105 blur-xl opacity-50' 
              : 'bg-transparent scale-100 blur-0 opacity-0'
            }
            ${isProcessing ? 'animate-pulse bg-zinc-300 dark:bg-zinc-700' : ''}
          `}
        />
        
        <div 
          className={`
            relative flex items-center bg-white dark:bg-black
            border border-zinc-200 dark:border-zinc-800
            rounded-2xl transition-all duration-300
            ${isFocused 
              ? 'border-zinc-400 dark:border-zinc-600 shadow-lg' 
              : 'hover:border-zinc-300 dark:hover:border-zinc-700'
            }
            ${isProcessing ? 'border-zinc-400 dark:border-zinc-600' : ''}
          `}
        >
          <Sparkles 
            className={`
              w-5 h-5 ml-4 transition-colors duration-300
              ${isProcessing 
                ? 'text-zinc-400 animate-pulse' 
                : isFocused 
                  ? 'text-zinc-900 dark:text-zinc-100' 
                  : 'text-zinc-400'
              }
            `}
          />
          
          <textarea
            value={displayText}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={placeholder}
            rows={1}
            className={`
              w-full py-4 px-4 bg-transparent text-lg
              placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100
              focus:outline-none resize-none overflow-hidden
              disabled:cursor-not-allowed disabled:opacity-60
            `}
            style={{
              minHeight: '60px',
              maxHeight: '200px'
            }}
          />
          
          {value.trim() && !isProcessing && (
            <div className="pr-4">
              <span className="text-xs text-zinc-400">Press Enter</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="pr-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
