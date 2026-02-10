import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionEngine, Plan, IntentClassification, Step } from '../execution-engine';

// Mock the tools module
vi.mock('../tools', () => ({
  executeTool: vi.fn(),
}));

import { executeTool } from '../tools';

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;
  const mockCallbacks = {
    onStepStart: vi.fn(),
    onStepComplete: vi.fn(),
    onStepError: vi.fn(),
    onChainComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ExecutionEngine({ sessionId: 'test-session-123' });
  });

  describe('Happy Path', () => {
    it('should execute a restaurant to calendar event chain successfully', async () => {
      const plan: Plan = {
        intent_type: 'dining_reservation',
        constraints: ['find_restaurant', 'add_to_calendar'],
        ordered_steps: [
          {
            tool_name: 'search_restaurant',
            parameters: { cuisine: 'italian', lat: 51.5074, lon: -0.1278 },
            description: 'Find an Italian restaurant',
          },
          {
            tool_name: 'add_calendar_event',
            parameters: { title: '{{step[0].name}}', start_time: '2024-06-01T19:00:00' },
            description: 'Add to calendar',
          },
        ],
        summary: 'Your dinner is arranged.',
      };

      const classification: IntentClassification = {
        type: 'COMPLEX_PLAN',
        confidence: 0.95,
        isSpecialIntent: true,
        reason: 'Romantic dinner planning',
      };

      // Mock successful restaurant search
      vi.mocked(executeTool).mockImplementation(async (toolName: string, params: any) => {
        if (toolName === 'plan_execution') {
          // This is called with step index
          const stepIndex = params;
          if (stepIndex === 0) {
            return {
              result: {
                success: true,
                result: [{
                  name: 'Bella Italia',
                  address: '123 Main St, London',
                  cuisine: 'italian',
                }],
              },
            };
          } else if (stepIndex === 1) {
            return {
              result: {
                success: true,
                result: {
                  status: 'ready',
                  download_url: '/api/download-ics?title=Bella+Italia',
                },
              },
            };
          }
        }
        return { result: { success: true } };
      });

      const result = await engine.executeChain(plan, classification, mockCallbacks);

      expect(result.success).toBe(true);
      expect(result.toolResults).toHaveLength(2);
      expect(result.restaurantData).toEqual({
        name: 'Bella Italia',
        address: '123 Main St, London',
        cuisine: 'italian',
      });
      expect(result.hasCalendarEvent).toBe(true);
      expect(mockCallbacks.onStepStart).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onStepComplete).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onChainComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failure Recovery', () => {
    it('should halt gracefully when step 2 fails', async () => {
      const plan: Plan = {
        intent_type: 'dining_reservation',
        constraints: ['find_restaurant', 'add_to_calendar'],
        ordered_steps: [
          {
            tool_name: 'search_restaurant',
            parameters: { cuisine: 'italian' },
          },
          {
            tool_name: 'add_calendar_event',
            parameters: { title: 'Dinner' },
          },
        ],
        summary: 'Your dinner is arranged.',
      };

      const classification: IntentClassification = {
        type: 'COMPLEX_PLAN',
        confidence: 0.95,
      };

      vi.mocked(executeTool).mockImplementation(async (toolName: string, params: any) => {
        if (toolName === 'plan_execution') {
          const stepIndex = params;
          if (stepIndex === 0) {
            return {
              result: {
                success: true,
                result: [{ name: 'Test Restaurant', address: '123 Main St' }],
              },
            };
          } else if (stepIndex === 1) {
            throw new Error('Calendar API unavailable');
          }
        }
        return { result: { success: true } };
      });

      const result = await engine.executeChain(plan, classification, mockCallbacks);

      expect(result.success).toBe(false);
      expect(result.failedStepIndex).toBe(1);
      expect(result.failureError).toBe('Calendar API unavailable');
      expect(mockCallbacks.onStepError).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ message: 'Calendar API unavailable' }),
        expect.any(Number)
      );
    });
  });

  describe('Wine Shop Whisper Trigger Conditions', () => {
    it('should trigger wine shop search when restaurant has cuisine and calendar event is added', async () => {
      const plan: Plan = {
        intent_type: 'dining_reservation',
        constraints: ['find_restaurant', 'add_to_calendar'],
        ordered_steps: [
          {
            tool_name: 'search_restaurant',
            parameters: { cuisine: 'french' },
          },
          {
            tool_name: 'add_calendar_event',
            parameters: { title: 'Dinner' },
          },
        ],
        summary: 'Your arrangements are ready.',
      };

      const classification: IntentClassification = {
        type: 'COMPLEX_PLAN',
        confidence: 0.95,
        isSpecialIntent: true,
      };

      vi.mocked(executeTool).mockImplementation(async (toolName: string, params: any) => {
        if (toolName === 'find_event') {
          // Wine shop search
          return {
            success: true,
            result: [{
              name: 'Le Vin Boutique',
              location: '456 Wine St, London',
            }],
          };
        }
        if (toolName === 'plan_execution') {
          const stepIndex = params;
          if (stepIndex === 0) {
            return {
              result: {
                success: true,
                result: [{
                  name: 'Le Bistro',
                  address: '123 French St',
                  cuisine: 'french',
                }],
              },
            };
          } else if (stepIndex === 1) {
            return {
              result: {
                success: true,
                result: { status: 'ready' },
              },
            };
          }
        }
        return { result: { success: true } };
      });

      const result = await engine.executeChain(plan, classification, mockCallbacks);

      expect(result.wineShopResult).toEqual({
        name: 'Le Vin Boutique',
        location: '456 Wine St, London',
      });
    });

    it('should not trigger wine shop search for non-special intents', async () => {
      const plan: Plan = {
        intent_type: 'simple_search',
        constraints: ['find_restaurant'],
        ordered_steps: [
          {
            tool_name: 'search_restaurant',
            parameters: { cuisine: 'italian' },
          },
        ],
        summary: 'Restaurant found.',
      };

      const classification: IntentClassification = {
        type: 'TOOL_SEARCH',
        confidence: 0.9,
        isSpecialIntent: false,
      };

      vi.mocked(executeTool).mockImplementation(async (toolName: string, params: any) => {
        if (toolName === 'plan_execution') {
          return {
            result: {
              success: true,
              result: [{ name: 'Pasta Place', address: '123 Main St', cuisine: 'italian' }],
            },
          };
        }
        return { result: { success: true } };
      });

      const result = await engine.executeChain(plan, classification, mockCallbacks);

      // Wine shop search should not be triggered for simple searches
      const wineShopCalls = vi.mocked(executeTool).mock.calls.filter(
        call => call[0] === 'find_event'
      );
      expect(wineShopCalls).toHaveLength(0);
    });
  });

  describe('Offline Mode Fallback', () => {
    it('should detect offline mode and handle gracefully', async () => {
      // Create engine that simulates offline mode via mock
      const offlineEngine = new ExecutionEngine({ 
        sessionId: 'test-session-offline',
        // The engine checks navigator.onLine which we can't easily mock in Node
        // So we test that the error handling works when executeTool fails
      });

      const plan: Plan = {
        intent_type: 'dining_reservation',
        constraints: ['find_restaurant'],
        ordered_steps: [
          {
            tool_name: 'search_restaurant',
            parameters: { cuisine: 'italian' },
          },
        ],
        summary: 'Your dinner is arranged.',
      };

      const classification: IntentClassification = {
        type: 'COMPLEX_PLAN',
        confidence: 0.95,
      };

      vi.mocked(executeTool).mockRejectedValue(new Error('Network error - offline mode'));

      // The executeChain should handle network errors gracefully
      const result = await offlineEngine.executeChain(plan, classification, mockCallbacks);

      // Should fail due to network error
      expect(result.success).toBe(false);
      expect(result.failedStepIndex).toBe(0);
    });
  });

  describe('Session Context Updates', () => {
    it('should generate correct session context updates from restaurant data', () => {
      const restaurantData = {
        name: 'Romantic Spot',
        address: '123 Love Lane',
        cuisine: 'french',
      };

      const classification: IntentClassification = {
        type: 'COMPLEX_PLAN',
        confidence: 0.95,
        isSpecialIntent: true,
        metadata: { isDateNight: true },
      };

      const updates = engine.getSessionContextUpdates(restaurantData, classification);

      expect(updates).toEqual({
        cuisine: 'french',
        ambiance: 'romantic',
        occasion: 'date_night',
      });
    });

    it('should handle non-special intents correctly', () => {
      const restaurantData = {
        name: 'Quick Bite',
        cuisine: 'fast_food',
      };

      const classification: IntentClassification = {
        type: 'TOOL_SEARCH',
        confidence: 0.8,
        isSpecialIntent: false,
      };

      const updates = engine.getSessionContextUpdates(restaurantData, classification);

      expect(updates).toEqual({
        cuisine: 'fast_food',
        ambiance: 'standard',
        occasion: undefined,
      });
    });
  });
});
