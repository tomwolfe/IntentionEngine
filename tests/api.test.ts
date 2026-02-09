import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as auditPOST } from '@/app/api/audit/route';
import { POST as intentPOST } from '@/app/api/intent/route';
import { POST as executePOST } from '@/app/api/execute/route';
import { GET as downloadIcsGET } from '@/app/api/download-ics/route';
import { NextRequest } from 'next/server';
import * as audit from '@/lib/audit';
import { rateLimitCache } from '@/lib/reliability';

global.fetch = vi.fn();

vi.mock('@/lib/llm', () => ({
  generatePlan: vi.fn().mockResolvedValue({
    intent_type: 'TOOL_SEARCH',
    constraints: [],
    ordered_steps: [],
    summary: 'Mock Plan'
  })
}));

describe('API Endpoints', () => {
  beforeEach(() => {
    rateLimitCache.clear();
    vi.clearAllMocks();
  });

  it('POST /api/audit should create an audit log', async () => {
    const req = new NextRequest('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ intent: 'test intent' })
    });
    const res = await auditPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.audit_log_id).toBeDefined();
  });

  it('POST /api/audit should handle invalid parameters', async () => {
    const req = new NextRequest('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ invalid: 'field' })
    });
    const res = await auditPOST(req);
    expect(res.status).toBe(400);
  });

  it('POST /api/audit should handle failure', async () => {
    const spy = vi.spyOn(audit, 'createAuditLog').mockRejectedValue(new Error('Audit creation failed'));

    const req = new NextRequest('http://localhost/api/audit', {
      method: 'POST',
      body: JSON.stringify({ intent: 'test intent' })
    });
    const res = await auditPOST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create audit log" });

    spy.mockRestore();
  });

  it('POST /api/intent should generate a plan', async () => {
    const req = new NextRequest('http://localhost/api/intent', {
      method: 'POST',
      body: JSON.stringify({ intent: 'I want a romantic dinner' })
    });
    const res = await intentPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan).toBeDefined();
    expect(data.audit_log_id).toBeDefined();
  });

  it('POST /api/intent should handle plan generation failure', async () => {
    const { generatePlan } = await import('@/lib/llm');
    (generatePlan as any).mockRejectedValueOnce(new Error('LLM Error'));

    const req = new NextRequest('http://localhost/api/intent', {
      method: 'POST',
      body: JSON.stringify({ intent: 'I want to find a nice place to eat and then schedule it' })
    });
    const res = await intentPOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan.intent_type).toBe('dining_fallback');
    expect(data.is_fallback).toBe(true);
  });

  it('POST /api/intent should handle invalid request', async () => {
    const req = new NextRequest('http://localhost/api/intent', {
      method: 'POST',
      body: 'invalid json'
    });
    const res = await intentPOST(req);
    expect(res.status).toBe(400);
  });

  it('GET /api/download-ics should return ICS file', async () => {
    const req = new NextRequest('http://localhost/api/download-ics?title=Dinner&start=2026-02-05T19:00:00Z');
    const res = await downloadIcsGET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar');
    const text = await res.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:Dinner');
  });

  it('POST /api/execute should execute a step', async () => {
    const plan = {
      intent_type: 'TOOL_SEARCH',
      constraints: [],
      ordered_steps: [{
        tool_name: 'geocode_location',
        parameters: { location: 'New York' },
        requires_confirmation: false,
        description: 'Geocoding'
      }],
      summary: 'Test Plan'
    };
    
    const log = await audit.createAuditLog('test execute');
    await audit.updateAuditLog(log.id, { plan });

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ lat: '40.7', lon: '-74' }])
    });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0 })
    });
    
    const res = await executePOST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.success).toBe(true);
    
    const updatedLog = await audit.getAuditLog(log.id);
    expect(updatedLog?.steps[0].status).toBe('executed');
  });

  it('POST /api/execute should require confirmation if specified', async () => {
    const plan = {
      intent_type: 'TOOL_CALENDAR',
      constraints: [],
      ordered_steps: [{
        tool_name: 'add_calendar_event',
        parameters: { title: 'Dinner', start_time: '...', end_time: '...' },
        requires_confirmation: true,
        description: 'Adding to calendar'
      }],
      summary: 'Test Plan'
    };
    
    const log = await audit.createAuditLog('test confirm');
    await audit.updateAuditLog(log.id, { plan });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0, user_confirmed: false })
    });
    
    const res = await executePOST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "User confirmation required for this step" });
  });

  it('POST /api/execute should handle already executed step', async () => {
    const plan = {
      intent_type: 'TOOL_SEARCH',
      constraints: [],
      ordered_steps: [{
        tool_name: 'geocode_location',
        parameters: { location: 'New York' },
        requires_confirmation: false,
        description: 'Geocoding'
      }],
      summary: 'Test Plan'
    };
    
    const log = await audit.createAuditLog('test already');
    const stepLog = {
      step_index: 0,
      tool_name: 'geocode_location',
      status: 'executed' as const,
      input: { location: 'New York' },
      output: { success: true },
    };
    await audit.updateAuditLog(log.id, { plan, steps: [stepLog] });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0 })
    });
    
    const res = await executePOST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Step already executed" });
  });

  it('POST /api/execute should handle tool execution error', async () => {
    vi.useFakeTimers();
    const plan = {
      intent_type: 'TOOL_SEARCH',
      constraints: [],
      ordered_steps: [{
        tool_name: 'geocode_location',
        parameters: { location: 'Fail' },
        requires_confirmation: false,
        description: 'Geocoding'
      }],
      summary: 'Test Plan'
    };
    
    const log = await audit.createAuditLog('test error');
    await audit.updateAuditLog(log.id, { plan });

    (fetch as any).mockRejectedValue(new Error('Network failure'));

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0 })
    });
    
    const promise = executePOST(req);
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.success).toBe(false);
    
    const updatedLog = await audit.getAuditLog(log.id);
    expect(updatedLog?.steps[0].status).toBe('executed'); 
    vi.useRealTimers();
  });

  it('POST /api/execute should handle tool not found', async () => {
    const plan = {
      intent_type: 'TOOL_SEARCH',
      constraints: [],
      ordered_steps: [{
        tool_name: 'nonexistent_tool',
        parameters: {},
        requires_confirmation: false,
        description: 'Test'
      }],
      summary: 'Test Plan'
    };
    
    const log = await audit.createAuditLog('test nonexistent');
    await audit.updateAuditLog(log.id, { plan });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0 })
    });
    
    const res = await executePOST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Tool nonexistent_tool not found" });
  });

  it('POST /api/execute should handle invalid parameters', async () => {
    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: '', step_index: -1 })
    });
    const res = await executePOST(req);
    expect(res.status).toBe(400);
  });

  it('POST /api/execute should handle missing step', async () => {
    const plan = {
      intent_type: 'TOOL_SEARCH',
      constraints: [],
      ordered_steps: [],
      summary: 'Empty Plan'
    };
    const log = await audit.createAuditLog('test missing step');
    await audit.updateAuditLog(log.id, { plan });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0 })
    });
    const res = await executePOST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Step not found" });
  });

  it('updateAuditLog should throw on invalid outcome schema', async () => {
    const log = await audit.createAuditLog('test invalid');
    await expect(audit.updateAuditLog(log.id, { 
      final_outcome: { status: 'INVALID', message: 'test' } as any 
    })).rejects.toThrow('Invalid audit outcome schema');
  });
});
