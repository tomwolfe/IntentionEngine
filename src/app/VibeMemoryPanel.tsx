"use client";

import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { getVibeMemory, clearVibeMemory } from "./vibe-actions";

interface VibeMemoryPanelProps {
  hasTriggeredSearch: boolean;
}

export function VibeMemoryPanel({ hasTriggeredSearch }: VibeMemoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [memory, setMemory] = useState<{ cuisines: string[], preferences: Record<string, string> }>({ cuisines: [], preferences: {} });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkMemory = async () => {
      try {
        const data = await getVibeMemory();
        if ((data.cuisines && data.cuisines.length > 0) || (data.preferences && Object.keys(data.preferences).length > 0)) {
          setMemory(data);
          setIsVisible(true);
        } else if (!hasTriggeredSearch) {
          setIsVisible(false);
        }
      } catch (err) {
        console.warn("Failed to fetch vibe memory", err);
      }
    };

    checkMemory();
    
    // If we just triggered a search, check again after a short delay to catch the update
    if (hasTriggeredSearch) {
      const timer = setTimeout(checkMemory, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasTriggeredSearch]);

  const handleClear = async () => {
    try {
      await clearVibeMemory();
      setMemory([]);
      setIsVisible(false);
      setIsOpen(false);
    } catch (err) {
      console.warn("Failed to clear vibe memory", err);
    }
  };

  // Only show if we have memory or if we've triggered a search in this session
  if (!isVisible && !hasTriggeredSearch) return null;

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 left-8 p-4 bg-white border border-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all hover:scale-110 shadow-xl z-40 group"
        aria-label="Vibe Memory"
      >
        <Sparkles size={24} className={`${memory.length > 0 ? "text-amber-400" : ""} group-hover:rotate-12 transition-transform`} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-start p-8 pointer-events-none">
          <div 
            className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] pointer-events-auto" 
            onClick={() => setIsOpen(false)}
          />
          <div className="relative bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-xs animate-in slide-in-from-bottom-8 duration-500 pointer-events-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="font-bold text-2xl tracking-tight">Vibe</h3>
                <p className="text-slate-400 text-sm">Memory</p>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6 mb-10 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
              {memory.cuisines.length > 0 || Object.keys(memory.preferences).length > 0 ? (
                <>
                  {Object.entries(memory.preferences).map(([key, value], i) => (
                    <div key={`pref-${i}`} className="group/item">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1 group-hover/item:text-amber-400/80 transition-colors">{key}</p>
                      <p className="text-white text-sm font-medium leading-relaxed">{value}</p>
                    </div>
                  ))}
                  
                  {memory.cuisines.length > 0 && (
                    <div className="pt-4 border-t border-white/5">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Recent Cuisines</p>
                      <div className="flex flex-wrap gap-2">
                        {memory.cuisines.map((item, i) => (
                          <span key={`cuisine-${i}`} className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-medium text-slate-300">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 italic text-sm">Listening for your vibes...</p>
              )}
            </div>

            <button 
              onClick={handleClear}
              className="w-full py-4 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-2xl font-bold text-base transition-all active:scale-[0.98] border border-white/5 hover:border-red-500/20"
            >
              Clear Memory
            </button>
          </div>
        </div>
      )}
    </>
  );
}
