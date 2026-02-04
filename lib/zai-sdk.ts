export interface CompletionOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  thinking?: {
    type: 'enabled' | 'disabled';
  };
}

export interface CompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
    thinking?: string;
  }>;
}

export class ZAIClient {
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    // Mock implementation simulating GLM-4.7-flash behavior
    const userMessage = options.messages.find(m => m.role === 'user')?.content || '';
    
    // Simulate thinking process
    const thinking = this.generateThinking(userMessage);
    
    // Generate orchestrated response
    const content = this.generateOrchestratedResponse(userMessage);
    
    return {
      choices: [{
        message: { content },
        thinking
      }]
    };
  }

  private generateThinking(intent: string): string {
    return `Analyzing intent: "${intent}". Breaking down into sequential actions: dining reservation, transportation, calendar event, and personalized preferences.`;
  }

  private generateOrchestratedResponse(intent: string): string {
    const lowerIntent = intent.toLowerCase();
    
    // Parse intent and generate appropriate orchestration
    if (lowerIntent.includes('sarah') && lowerIntent.includes('dinner')) {
      return JSON.stringify({
        orchestration: {
          intent: "Dinner with Sarah",
          confidence: 0.97,
          actions: [
            {
              service: "opentable",
              action: "create_reservation",
              status: "confirmed",
              details: {
                restaurant: "Bar Italia",
                time: "7:00 PM",
                date: "Friday",
                party_size: 2,
                preferences_applied: ["Italian cuisine", "Quiet seating", "No shellfish menu options"]
              }
            },
            {
              service: "uber",
              action: "schedule_ride",
              status: "scheduled",
              details: {
                pickup_time: "6:15 PM",
                pickup_location: "Current Location",
                destination: "Bar Italia",
                ride_type: "Uber Black",
                estimated_arrival: "6:45 PM"
              }
            },
            {
              service: "calendar",
              action: "create_event",
              status: "created",
              details: {
                title: "Dinner with Sarah",
                start_time: "7:00 PM",
                end_time: "9:00 PM",
                date: "Friday",
                location: "Bar Italia",
                reminder: "15 minutes before"
              }
            },
            {
              service: "personal_context",
              action: "apply_preferences",
              status: "applied",
              details: {
                for: "Sarah",
                notes: ["Prefers Italian restaurants", "Dislikes loud music", "Allergic to shellfish"],
                special_requests: "Request quiet table away from kitchen"
              }
            }
          ],
          summary: "Complete dinner experience orchestrated for you and Sarah on Friday at 7 PM. Restaurant reservation confirmed at Bar Italia (Italian cuisine, quiet seating), Uber Black scheduled for 6:15 PM pickup, calendar event created, and Sarah's preferences applied (no shellfish, quiet atmosphere)."
        }
      }, null, 2);
    }

    // Generic orchestration for other intents
    return JSON.stringify({
      orchestration: {
        intent: intent,
        confidence: 0.85,
        actions: [
          {
            service: "context_analysis",
            action: "analyze_intent",
            status: "completed",
            details: {
              detected_entities: ["time", "location", "people"],
              suggested_services: ["calendar", "transportation", "dining"]
            }
          }
        ],
        summary: `Intent analyzed: "${intent}". Ready to orchestrate based on your preferences.`
      }
    }, null, 2);
  }
}

export function createClient(config: { apiKey: string }): ZAIClient {
  return new ZAIClient(config);
}
