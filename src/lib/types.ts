export interface OrchestratedAction {
  service: string;
  action: string;
  status: 'confirmed' | 'scheduled' | 'created' | 'applied' | 'completed' | 'pending';
  details: Record<string, any>;
}

export interface OrchestrationResult {
  orchestration: {
    intent: string;
    confidence: number;
    actions: OrchestratedAction[];
    summary: string;
  };
}

export interface OutcomeCard {
  icon: string;
  title: string;
  subtitle: string;
  status: 'success' | 'pending' | 'error';
  details: string[];
}
