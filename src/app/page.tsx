'use client';

import { useState } from 'react';

interface ExecutionStep {
  step_id: string;
  step_number: number;
  status: string;
  description?: string;
  requires_confirmation?: boolean;
  result?: unknown;
  error?: string;
}

interface ExecutionResponse {
  success: boolean;
  execution_id: string;
  status: string;
  summary: string;
  step_results: ExecutionStep[];
  outputs?: Record<string, unknown>;
  pending_confirmations?: Array<{
    step_id: string;
    step_number: number;
    description: string;
  }>;
}

export default function Home() {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const handleSubmitIntent = async () => {
    if (!intent.trim()) return;
    
    setLoading(true);
    setError(null);
    setPlan(null);
    setExecution(null);
    
    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Failed to generate plan');
        return;
      }
      
      setPlan(data.plan);
      
      // Execute immediately if no confirmations needed
      if (!data.requires_confirmation) {
        await executePlan(data.plan, {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const executePlan = async (planData: unknown, confs: Record<string, boolean>) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planData,
          confirmations: confs,
        }),
      });
      
      const data: ExecutionResponse = await response.json();
      setExecution(data);
      
      if (data.pending_confirmations && data.pending_confirmations.length > 0) {
        // Initialize confirmations state
        const newConfs: Record<string, boolean> = {};
        data.pending_confirmations.forEach(pc => {
          newConfs[pc.step_id] = false;
        });
        setConfirmations(newConfs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndExecute = async () => {
    if (!plan) return;
    await executePlan(plan, confirmations);
  };

  const toggleConfirmation = (stepId: string) => {
    setConfirmations(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  return (
    <main>
      <section style={{ marginBottom: '30px' }}>
        <h2>Enter Your Intent</h2>
        <p style={{ color: '#666', marginBottom: '15px' }}>
          Try: &quot;Plan dinner with Sarah tomorrow at 7pm and add it to my calendar&quot;
        </p>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What would you like to do?"
          style={{
            width: '100%',
            height: '80px',
            padding: '10px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '10px',
          }}
        />
        <button
          onClick={handleSubmitIntent}
          disabled={loading || !intent.trim()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processing...' : 'Generate Plan'}
        </button>
      </section>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#ffebee',
          border: '1px solid #ef5350',
          borderRadius: '4px',
          marginBottom: '20px',
        }}>
          <strong style={{ color: '#c62828' }}>Error:</strong> {error}
        </div>
      )}

      {plan && (
        <section style={{ marginBottom: '30px' }}>
          <h3>Generated Plan</h3>
          <pre style={{
            backgroundColor: '#f5f5f5',
            padding: '15px',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '13px',
            maxHeight: '400px',
          }}>
            {JSON.stringify(plan, null, 2)}
          </pre>
        </section>
      )}

      {execution?.pending_confirmations && execution.pending_confirmations.length > 0 && (
        <section style={{
          padding: '20px',
          backgroundColor: '#fff3e0',
          border: '1px solid #ff9800',
          borderRadius: '4px',
          marginBottom: '20px',
        }}>
          <h3 style={{ marginTop: 0 }}>Confirmation Required</h3>
          <p>The following actions require your explicit confirmation:</p>
          
          {execution.pending_confirmations.map((pc) => (
            <div key={pc.step_id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px',
              backgroundColor: 'white',
              marginBottom: '10px',
              borderRadius: '4px',
            }}>
              <input
                type="checkbox"
                id={pc.step_id}
                checked={confirmations[pc.step_id] || false}
                onChange={() => toggleConfirmation(pc.step_id)}
                style={{ marginRight: '10px' }}
              />
              <label htmlFor={pc.step_id}>
                <strong>Step {pc.step_number}:</strong> {pc.description}
              </label>
            </div>
          ))}
          
          <button
            onClick={handleConfirmAndExecute}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '10px',
            }}
          >
            {loading ? 'Executing...' : 'Confirm & Execute'}
          </button>
        </section>
      )}

      {execution && (
        <section style={{ marginBottom: '30px' }}>
          <h3>Execution Result</h3>
          <div style={{
            padding: '15px',
            backgroundColor: execution.success ? '#e8f5e9' : '#ffebee',
            border: `1px solid ${execution.success ? '#4caf50' : '#ef5350'}`,
            borderRadius: '4px',
            marginBottom: '15px',
          }}>
            <p><strong>Execution ID:</strong> {execution.execution_id}</p>
            <p><strong>Status:</strong> {execution.status}</p>
            <p><strong>Summary:</strong> {execution.summary}</p>
          </div>

          <h4>Step Results</h4>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Step</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {execution.step_results.map((step) => (
                <tr key={step.step_id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                    #{step.step_number}
                    {step.requires_confirmation && (
                      <span style={{
                        marginLeft: '5px',
                        fontSize: '12px',
                        color: '#ff9800',
                      }}>
                        (requires confirmation)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                    <span style={{
                      color: step.status === 'completed' ? '#4caf50' : 
                             step.status === 'failed' ? '#ef5350' :
                             step.status === 'pending_confirmation' ? '#ff9800' : '#666',
                    }}>
                      {step.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                    {step.error ? (
                      <span style={{ color: '#ef5350' }}>{step.error}</span>
                    ) : step.result ? (
                      <pre style={{ margin: 0, fontSize: '12px' }}>
                        {JSON.stringify(step.result, null, 2)}
                      </pre>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {execution.outputs && Object.keys(execution.outputs).length > 0 && (
            <>
              <h4 style={{ marginTop: '20px' }}>Outputs</h4>
              <pre style={{
                backgroundColor: '#f5f5f5',
                padding: '15px',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '13px',
              }}>
                {JSON.stringify(execution.outputs, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}

      <section style={{
        padding: '20px',
        backgroundColor: '#e3f2fd',
        borderRadius: '4px',
        marginTop: '30px',
      }}>
        <h3 style={{ marginTop: 0 }}>System Architecture</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li><strong>Intent Input:</strong> Natural language intent submitted by user</li>
          <li><strong>LLM Reasoning:</strong> GLM-4.7-flash converts intent to structured JSON plan</li>
          <li><strong>Schema Validation:</strong> Plan validated against strict Zod schema</li>
          <li><strong>User Confirmation:</strong> Critical steps flagged for explicit approval</li>
          <li><strong>Deterministic Execution:</strong> Validated plan executed via deterministic code</li>
          <li><strong>Audit Logging:</strong> Complete execution trace captured and stored</li>
        </ol>
        <p>
          <strong>Key Principle:</strong> LLM never directly calls external APIs. 
          All side effects go through deterministic, auditable code paths.
        </p>
      </section>
    </main>
  );
}
