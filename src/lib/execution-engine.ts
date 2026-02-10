import { executeTool } from './tools';
import { logger } from './logger';

export interface Step {
  tool_name: string;
  parameters: Record<string, any>;
  requires_confirmation?: boolean;
  description?: string;
}

export interface Plan {
  intent_type: string;
  constraints: string[];
  ordered_steps: Step[];
  summary: string;
}

export interface IntentClassification {
  type: string;
  confidence: number;
  isSpecialIntent?: boolean;
  metadata?: {
    isDateNight?: boolean;
    [key: string]: any;
  };
  reason?: string;
}

export interface ToolResult {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: "output-available" | "output-denied" | "input-available" | "partial-call" | "call";
  input: any;
  output: any;
  duration?: number;
  timestamp?: string;
}

export interface ExecutionResult {
  success: boolean;
  toolResults: ToolResult[];
  restaurantData: any | null;
  wineShopResult: any | null;
  failedStepIndex: number | null;
  failureError: string | null;
  finalSummary: string;
  hasCalendarEvent: boolean;
  totalDuration?: number;
}

export interface ExecutionCallbacks {
  onStepStart: (index: number, step: Step) => void;
  onStepComplete: (index: number, result: any, duration: number) => void;
  onStepError: (index: number, error: Error, duration: number) => void;
  onChainComplete: (results: ToolResult[], totalDuration: number) => void;
}

export class ExecutionEngine {
  private sessionId?: string;
  private localProvider?: any;

  constructor(options?: { sessionId?: string; localProvider?: any }) {
    this.sessionId = options?.sessionId;
    this.localProvider = options?.localProvider;
  }

  async executeChain(
    plan: Plan,
    classification: IntentClassification,
    callbacks: ExecutionCallbacks
  ): Promise<ExecutionResult> {
    const toolResults: ToolResult[] = [];
    let restaurantData: any = null;
    let hasCalendarEvent = false;
    let wineShopResult: any = null;
    let failedStepIndex: number | null = null;
    let failureError: string | null = null;
    let isOffline = false;
    const chainStartTime = Date.now();

    // Check offline status (default to online in test/server environments)
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      isOffline = !navigator.onLine;
    } else {
      isOffline = false; // Default to online when navigator not available
    }

    logger.info('Starting execution chain', {
      sessionId: this.sessionId,
      stepCount: plan.ordered_steps.length,
      intentType: plan.intent_type,
    });

    try {
      for (let i = 0; i < plan.ordered_steps.length; i++) {
        const step = plan.ordered_steps[i];
        const stepStartTime = Date.now();
        
        // Trigger offline check before network-dependent steps
        if (isOffline && this.isNetworkDependent(step)) {
          throw new Error('Offline during network-dependent step');
        }

        callbacks.onStepStart(i, step);

        // Autonomous Wine Shop: Trigger in background after restaurant search
        if (restaurantData?.cuisine && step.tool_name === 'add_calendar_event') {
          try {
            const res = await executeTool('find_event', {
              location: restaurantData.address,
              query: 'wine shop'
            }, this.sessionId);
            if (res?.success && res?.result?.[0]) {
              wineShopResult = res.result[0];
            }
          } catch (e) {
            logger.warn('Silent wine shop search failed', { error: (e as Error).message });
          }
        }

        try {
          const { result } = await executeTool('plan_execution', i, this.sessionId);
          const stepDuration = Date.now() - stepStartTime;
          
          toolResults.push({
            type: "dynamic-tool",
            toolName: step.tool_name,
            toolCallId: `call_${Date.now()}_${i}`,
            state: "output-available",
            input: step.parameters,
            output: result,
            duration: stepDuration,
            timestamp: new Date().toISOString(),
          });
          
          logger.info(`Step ${i} completed`, {
            stepIndex: i,
            toolName: step.tool_name,
            duration: stepDuration,
          });
          
          callbacks.onStepComplete(i, result, stepDuration);
          
          // Track restaurant data for whisper and session context
          if (step.tool_name === 'search_restaurant' && result?.success && result?.result?.[0]) {
            restaurantData = result.result[0];
          }
          
          // Track if we have a calendar event
          if (step.tool_name === 'add_calendar_event') {
            hasCalendarEvent = true;
          }
        } catch (stepErr: any) {
          const stepDuration = Date.now() - stepStartTime;
          logger.error(`Step ${i} failed`, stepErr, {
            stepIndex: i,
            toolName: step.tool_name,
            duration: stepDuration,
          });
          failedStepIndex = i;
          failureError = stepErr.message;
          callbacks.onStepError(i, stepErr, stepDuration);
          break; // Halt execution on critical step failure
        }
      }

      // Propagation: Ensure restaurant details flow into the calendar part
      this.propagateRestaurantData(toolResults, restaurantData, wineShopResult);
      
      // Generate final summary
      const finalSummary = await this.generateSummary(
        plan,
        classification,
        failedStepIndex,
        isOffline
      );

      const totalDuration = Date.now() - chainStartTime;
      
      logger.info('Execution chain completed', {
        success: failedStepIndex === null,
        totalSteps: toolResults.length,
        failedStep: failedStepIndex,
        totalDuration,
      });

      callbacks.onChainComplete(toolResults, totalDuration);

      return {
        success: failedStepIndex === null,
        toolResults,
        restaurantData,
        wineShopResult,
        failedStepIndex,
        failureError,
        finalSummary,
        hasCalendarEvent,
        totalDuration,
      };
    } catch (err: any) {
      logger.error('Execution chain failed', err, {
        sessionId: this.sessionId,
        stepCount: plan.ordered_steps.length,
      });
      throw err;
    }
  }

  private isNetworkDependent(step: Step): boolean {
    // Tools that require network access
    const networkDependentTools = [
      'search_restaurant',
      'find_event',
      'get_weather_forecast',
      'geocode_location',
      'get_directions'
    ];
    return networkDependentTools.includes(step.tool_name);
  }

  private propagateRestaurantData(
    toolResults: ToolResult[],
    restaurantData: any,
    wineShopResult: any
  ): void {
    const searchPart = toolResults.find(p => p.toolName === 'search_restaurant');
    const calendarPart = toolResults.find(p => p.toolName === 'add_calendar_event');

    if (searchPart && calendarPart && restaurantData) {
      calendarPart.input = {
        ...calendarPart.input,
        title: restaurantData.name,
        location: restaurantData.address,
        restaurant_name: restaurantData.name,
        restaurant_address: restaurantData.address,
        wine_shop: wineShopResult ? { name: wineShopResult.name, address: wineShopResult.location } : undefined
      };
    }
  }

  private async generateSummary(
    plan: Plan,
    classification: IntentClassification,
    failedStepIndex: number | null,
    isOffline: boolean
  ): Promise<string> {
    if (failedStepIndex !== null) {
      return "We encountered a minor issue while preparing your plans. Please review the details below.";
    }

    let finalSummary = plan.summary;
    const forbiddenWords = ["found", "searched", "scheduled", "prepared", "I've"];
    const isBadWhisper = !finalSummary || 
      finalSummary.length > 100 || 
      forbiddenWords.some(word => finalSummary.toLowerCase().includes(word));

    if (isBadWhisper || isOffline) {
      if (this.localProvider) {
        try {
          const engine = await this.localProvider.getEngine(() => {});
          await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
          const whisperPrompt = `Describe this in one poetic sentence under 100 chars: ${classification.reason}. No AI words.`;
          finalSummary = await engine.generate(whisperPrompt);
          if (finalSummary.length > 100) finalSummary = "Your arrangements are ready.";
        } catch (err) {
          finalSummary = "A bottle of wine has been suggested for your evening.";
        }
      } else {
        finalSummary = "A bottle of wine has been suggested for your evening.";
      }
    }

    return finalSummary;
  }

  getSessionContextUpdates(
    restaurantData: any,
    classification: IntentClassification
  ): Record<string, any> {
    if (!restaurantData) return {};
    
    return {
      cuisine: restaurantData.cuisine,
      ambiance: classification.isSpecialIntent ? 'romantic' : 'standard',
      occasion: classification.metadata?.isDateNight ? 'date_night' : undefined
    };
  }
}
