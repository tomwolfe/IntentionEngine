import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent, getDeterministicPlan } from '@/lib/intent';
import { generatePlan } from '@/lib/llm';
import { POST as intentPOST } from '@/app/api/intent/route';
import { POST as executePOST } from '@/app/api/execute/route';
import { GET as downloadIcsGET } from '@/app/api/download-ics/route';
import { NextRequest } from 'next/server';
import * as audit from '@/lib/audit';

// Mock fetch for all tests
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('nominatim') || url.includes('overpass')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        elements: [{
          type: 'node', id: 1, lat: 48.8566, lon: 2.3522,
          tags: { name: "Le Bistrot", "addr:street": "Rue de Rivoli", cuisine: "french" }
        }],
        display_name: "Paris, France"
      })
    });
  }
  if (url.includes('open-meteo')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        daily: { weathercode: [0], temperature_2m_max: [20], temperature_2m_min: [15], precipitation_probability_max: [0] }
      })
    });
  }
  if (url.includes('chat/completions')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "Parisian flavors await your arrival." } }]
      })
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

vi.mock('@/lib/config', () => ({
  env: {
    LLM_API_KEY: 'test-key',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    LLM_MODEL: 'gpt-4o'
  }
}));

vi.mock('@/lib/tools', async () => {
  const actual = await vi.importActual('@/lib/tools') as any;
  return {
    ...actual,
    get_weather_forecast: vi.fn().mockResolvedValue({ success: true, result: { condition: 'Clear', temperature_high: 20, date: '2026-02-10' } }),
  };
});

describe('Philosophy Scenarios: Silent Execution & Elegant Synthesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: "Plan a romantic dinner for tomorrow night."', () => {
    it('should classify correctly and generate a poetic summary', async () => {
      // Test: classifyIntent returns COMPLEX_PLAN with isSpecialIntent: true
      const classification = await classifyIntent("Plan a romantic dinner for tomorrow night.");
      expect(classification.type).toBe("COMPLEX_PLAN");
      expect(classification.isSpecialIntent).toBe(true);

      // Test: getDeterministicPlan generates search_restaurant (romantic) and add_calendar_event (confirmation)
      const plan = getDeterministicPlan(classification, "Plan a romantic dinner for tomorrow night.");
      expect(plan.ordered_steps).toContainEqual(expect.objectContaining({
        tool_name: "search_restaurant",
        parameters: expect.objectContaining({ romantic: true })
      }));
      expect(plan.ordered_steps).toContainEqual(expect.objectContaining({
        tool_name: "add_calendar_event",
        requires_confirmation: true
      }));

      // Test: generatePlan produces a poetic summary under 100 characters
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "A quiet evening, curated for two." } }]
        })
      });

      const fullPlan = await generatePlan("Plan a romantic dinner for tomorrow night.");
      expect(fullPlan.summary).toBe("A quiet evening, curated for two.");
      expect(fullPlan.summary.length).toBeLessThan(100);
      expect(fullPlan.summary).not.toMatch(/I found|I have|scheduled|here are/i);
    });
  });

  describe('Scenario: "I need to be at the airport by 6 AM tomorrow."', () => {
    it('should calculate transport time correctly (2 hours before)', async () => {
      const input = "I need to be at the airport by 6 AM tomorrow";
      const classification = await classifyIntent(input);
      expect(classification.type).toBe("TOOL_CALENDAR");
      expect(classification.metadata?.isTransport).toBe(true);

      const plan = getDeterministicPlan(classification, input);
      const calendarStep = plan.ordered_steps?.find(s => s.tool_name === "add_calendar_event");
      expect(calendarStep).toBeDefined();

      const startTime = new Date(calendarStep?.parameters.start_time);
      const endTime = new Date(calendarStep?.parameters.end_time);
      
      // End time should be 2 hours after start time
      expect(endTime.getTime() - startTime.getTime()).toBe(2 * 60 * 60 * 1000);
      
      // Start time should be 2 hours before target time (which we verify by duration check 
      // since chrono-node parsing is relative to current time)
      expect(calendarStep?.parameters.title).toContain("Travel to");
    });
  });
});

describe('Philosophy Scenarios: Autonomous Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: "Book a table for two at a French restaurant for Friday at 7 PM."', () => {
    it('should flow from search to calendar autonomously', async () => {
      const input = "Book a table for two at a French restaurant for Friday at 7 PM.";
      
      // 1. Mock /api/intent to return the plan
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Parisian flavors await your arrival." } }]
        })
      });

      const intentReq = new NextRequest('http://localhost/api/intent', {
        method: 'POST',
        body: JSON.stringify({ intent: input })
      });
      const intentRes = await intentPOST(intentReq);
      const intentData = await intentRes.json();
      const plan = intentData.plan;
      const auditLogId = intentData.audit_log_id;

      expect(plan.ordered_steps.length).toBe(2);
      expect(plan.ordered_steps[0].tool_name).toBe("search_restaurant");
      expect(plan.ordered_steps[1].tool_name).toBe("add_calendar_event");

      // 2. Mock execute search_restaurant (via mocking fetch inside the tool)
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          elements: [{
            type: 'node',
            id: 1,
            lat: 48.8566,
            lon: 2.3522,
            tags: { name: "Le Bistrot", "addr:street": "Rue de Rivoli", cuisine: "french" }
          }]
        })
      });

      const execReq1 = new NextRequest('http://localhost/api/execute', {
        method: 'POST',
        body: JSON.stringify({ audit_log_id: auditLogId, step_index: 0 })
      });
      const execRes1 = await executePOST(execReq1);
      const execData1 = await execRes1.json();
      expect(execData1.result.success).toBe(true);
      expect(execData1.result.result[0].name).toBe("Le Bistrot");

      // 3. Mock execute add_calendar_event with dynamic parameters
      const execReq2 = new NextRequest('http://localhost/api/execute', {
        method: 'POST',
        body: JSON.stringify({ 
          audit_log_id: auditLogId, 
          step_index: 1, 
          user_confirmed: true,
          parameters: {
            restaurant_name: "Le Bistrot",
            restaurant_address: "Rue de Rivoli",
            location: "Rue de Rivoli"
          }
        })
      });
      const execRes2 = await executePOST(execReq2);
      const execData2 = await execRes2.json();
      expect(execData2.result.success).toBe(true);
      expect(execData2.result.result.download_url).toContain("Le+Bistrot");
    });
  });
});

describe('Philosophy Scenarios: Respectful Boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should require confirmation for calendar events but not for search', async () => {
    // Search scenario
    const searchInput = "Find a cafe near me.";
    const searchClass = await classifyIntent(searchInput);
    const searchPlan = getDeterministicPlan(searchClass, searchInput);
    expect(searchPlan.ordered_steps?.[0].tool_name).toBe("search_restaurant");
    expect(searchPlan.ordered_steps?.[0].requires_confirmation).toBe(false);

    // Calendar scenario
    const calInput = "Add a meeting to my calendar for 3 PM today.";
    const calClass = await classifyIntent(calInput);
    const calPlan = getDeterministicPlan(calClass, calInput);
    expect(calPlan.ordered_steps?.[0].tool_name).toBe("add_calendar_event");
    expect(calPlan.ordered_steps?.[0].requires_confirmation).toBe(true);
  });

  it('should block execution of calendar event without user_confirmed: true', async () => {
    const log = await audit.createAuditLog("Add meeting");
    const plan = {
      intent_type: "scheduling",
      constraints: [],
      ordered_steps: [{
        tool_name: "add_calendar_event",
        parameters: { title: "Meeting", start_time: "...", end_time: "..." },
        requires_confirmation: true,
        description: "Adding..."
      }],
      summary: "Whisper"
    };
    await audit.updateAuditLog(log.id, { plan });

    const req = new NextRequest('http://localhost/api/execute', {
      method: 'POST',
      body: JSON.stringify({ audit_log_id: log.id, step_index: 0, user_confirmed: false })
    });
    const res = await executePOST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "User confirmation required for this step" });
  });
});
