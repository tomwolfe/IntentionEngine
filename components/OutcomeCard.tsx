'use client';

import { 
  Utensils, 
  Car, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock,
  AlertCircle
} from 'lucide-react';
import { OrchestratedAction } from '@/lib/types';

interface OutcomeCardProps {
  action: OrchestratedAction;
  index: number;
}

const serviceIcons: Record<string, React.ReactNode> = {
  opentable: <Utensils className="w-5 h-5" />,
  uber: <Car className="w-5 h-5" />,
  calendar: <Calendar className="w-5 h-5" />,
  personal_context: <User className="w-5 h-5" />,
  context_analysis: <AlertCircle className="w-5 h-5" />
};

const serviceNames: Record<string, string> = {
  opentable: 'OpenTable',
  uber: 'Uber',
  calendar: 'Calendar',
  personal_context: 'Personal Context',
  context_analysis: 'Analysis'
};

export default function OutcomeCard({ action, index }: OutcomeCardProps) {
  const icon = serviceIcons[action.service] || <CheckCircle2 className="w-5 h-5" />;
  const serviceName = serviceNames[action.service] || action.service;
  
  const isSuccess = ['confirmed', 'scheduled', 'created', 'applied', 'completed'].includes(action.status);
  const isPending = action.status === 'pending';

  const formatDetails = (details: Record<string, any>): string[] => {
    const lines: string[] = [];
    
    Object.entries(details).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        lines.push(`${formatKey(key)}: ${value.join(', ')}`);
      } else if (typeof value === 'string' || typeof value === 'number') {
        lines.push(`${formatKey(key)}: ${value}`);
      }
    });
    
    return lines;
  };

  const formatKey = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const details = formatDetails(action.details);
  const title = action.details.restaurant || action.details.title || action.details.pickup_location || `${serviceName} ${action.action}`;
  const subtitle = action.details.time || action.details.pickup_time || action.details.start_time || action.status;

  return (
    <div 
      className={`
        relative overflow-hidden rounded-xl border transition-all duration-500
        ${isSuccess 
          ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
          : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700'
        }
        animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-forwards
      `}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div 
            className={`
              flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
              ${isSuccess 
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black' 
                : 'bg-zinc-300 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-400'
              }
            `}
          >
            {icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {title}
              </h3>
              {isSuccess && (
                <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
              )}
              {isPending && (
                <Clock className="w-4 h-4 text-zinc-400 animate-pulse" />
              )}
            </div>
            
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              {subtitle} • {serviceName}
            </p>
            
            <div className="space-y-1">
              {details.slice(0, 3).map((detail, idx) => (
                <p 
                  key={idx} 
                  className="text-xs text-zinc-600 dark:text-zinc-300"
                >
                  {detail}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div 
        className={`
          absolute bottom-0 left-0 right-0 h-0.5
          ${isSuccess 
            ? 'bg-zinc-900 dark:bg-zinc-100' 
            : 'bg-zinc-400 dark:bg-zinc-600'
          }
        `}
      />
    </div>
  );
}
