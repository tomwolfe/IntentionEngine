import { Plan } from "./schema";

export interface ToolHealth {
  tool_name: string;
  success_rate: number; // 0 to 1 ratio of successful executions
  total_executions: number;
  last_failure_reason?: string;
  average_latency_ms: number;
}

export interface SystemHealth {
  tools: Record<string, ToolHealth>;
  overall_status: 'healthy' | 'degraded' | 'critical';
  last_updated: string;
}

export interface FailureMemory {
  intent_keywords: string[];
  failed_tool_name: string;
  error_message: string;
  input_params: any;
  timestamp: string;
  remedy_suggestion?: string; // Guidance for the LLM to avoid this error next time
  audit_log_id: string; // Reference to the log where it failed
}

export interface AuditLog {
  id: string;
  parent_id?: string; // To track re-plans as sub-events
  timestamp: string;
  intent: string;
  plan?: Plan;
  userLocation?: { lat: number; lng: number };
  rawModelResponse?: string;
  inferenceLatencies?: {
    intentInference?: number;
    planGeneration?: number;
    total?: number;
  };
  toolExecutionLatencies?: {
    latencies: { [tool_name: string]: number[] };
    totalToolExecutionTime?: number;
  };
  validation_error?: string;
  efficiency_flag?: "LOW";
  efficiency_score?: number; // (Result Quality / Total Latency)
  replanned_count?: number;
  steps: Array<{
    step_index: number;
    tool_name: string;
    status: "pending" | "executed" | "rejected" | "failed";
    input: any;
    output?: any;
    error?: string;
    confirmed_by_user?: boolean;
    timestamp: string;
    latency?: number;
  }>;
  final_outcome?: string;
}