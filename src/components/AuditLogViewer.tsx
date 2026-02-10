import React from 'react';
import { CheckCircle2, XCircle, Clock, ChevronRight, Activity } from 'lucide-react';

interface AuditStep {
  step_index: number;
  tool_name: string;
  status: "pending" | "executed" | "rejected" | "failed";
  input: any;
  output?: any;
  error?: string;
  timestamp: string;
  latency?: number;
}

interface AuditLog {
  id: string;
  timestamp: string;
  intent: string;
  plan?: {
    summary: string;
    ordered_steps: any[];
  };
  steps: AuditStep[];
  final_outcome?: string;
  toolExecutionLatencies?: {
    latencies: { [tool_name: string]: number[] };
    totalToolExecutionTime?: number;
  };
}

interface AuditLogViewerProps {
  logs: AuditLog[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 border rounded-lg border-dashed">
        No audit logs available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Activity className="text-blue-500" size={20} />
        Execution Audit Log
      </h2>
      <div className="space-y-4">
        {logs.map((log) => {
          const successfulSteps = log.steps.filter(s => s.status === 'executed').length;
          const totalSteps = log.steps.length;
          const efficiencyScore = totalSteps > 0 ? (successfulSteps / totalSteps).toFixed(2) : "1.00";

          return (
            <div key={log.id} className="border rounded-lg bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                <div>
                  <span className="text-xs font-mono text-slate-400 block uppercase tracking-wider">Session ID: {log.id}</span>
                  <h3 className="font-bold text-slate-800">"{log.intent}"</h3>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-xs text-slate-500 block">{new Date(log.timestamp).toLocaleString()}</span>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-700">
                      Efficiency: {efficiencyScore}
                    </span>
                    {log.final_outcome && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        log.final_outcome.toLowerCase().includes('success') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {log.final_outcome.split(':')[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {log.plan && (
                  <div className="bg-blue-50/50 p-3 rounded border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 uppercase mb-1 flex justify-between">
                      <span>Generated Plan</span>
                      {log.toolExecutionLatencies?.totalToolExecutionTime && (
                        <span>Total Tool Latency: {log.toolExecutionLatencies.totalToolExecutionTime}ms</span>
                      )}
                    </p>
                    <p className="text-sm text-blue-900">{log.plan.summary}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Execution Steps</p>
                  {log.steps.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No steps executed yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {log.steps.sort((a, b) => a.step_index - b.step_index).map((step, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                              step.status === 'executed' ? 'bg-green-100 border-green-200 text-green-600' :
                              step.status === 'failed' ? 'bg-red-100 border-red-200 text-red-600' :
                              'bg-slate-100 border-slate-200 text-slate-400'
                            }`}>
                              {step.status === 'executed' ? <CheckCircle2 size={14} /> :
                               step.status === 'failed' ? <XCircle size={14} /> :
                               <Clock size={14} />}
                            </div>
                            {idx < log.steps.length - 1 && <div className="w-px h-full bg-slate-100 my-1" />}
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-bold text-slate-700">
                                {step.tool_name.replace(/_/g, ' ')}
                                {step.latency && <span className="ml-2 text-[10px] font-normal text-slate-400">({step.latency}ms)</span>}
                              </span>
                              <span className="text-[10px] text-slate-400">{new Date(step.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="mt-1 space-y-1">
                              <div className="text-[11px] bg-slate-50 p-1.5 rounded border font-mono overflow-x-auto max-w-full">
                                <span className="text-slate-400">Input:</span> {JSON.stringify(step.input)}
                              </div>
                              {step.output && (
                                <div className="text-[11px] bg-green-50/30 p-1.5 rounded border border-green-100 font-mono overflow-x-auto max-w-full">
                                  <span className="text-green-600 font-bold">Result:</span> {JSON.stringify(step.output).substring(0, 200)}
                                  {JSON.stringify(step.output).length > 200 ? '...' : ''}
                                </div>
                              )}
                              {step.error && (
                                <div className="text-[11px] bg-red-50 p-1.5 rounded border border-red-100 text-red-600 font-mono">
                                  <span className="font-bold">Error:</span> {step.error}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {log.final_outcome && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Final Outcome</p>
                    <p className="text-sm text-slate-600 italic">"{log.final_outcome}"</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
