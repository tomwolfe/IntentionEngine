import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/zai-sdk';
import { personalContext, getContactContext } from '@/lib/personal-context';

// Initialize Z.AI client with mock API key
const zaiClient = createClient({ apiKey: process.env.ZAI_API_KEY || 'mock-api-key' });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intent } = body;

    if (!intent || typeof intent !== 'string') {
      return NextResponse.json(
        { error: 'Intent is required' },
        { status: 400 }
      );
    }

    // Extract mentioned contacts from intent
    const mentionedContacts = extractContactsFromIntent(intent);
    const contactContexts = mentionedContacts.map(name => getContactContext(name)).filter(Boolean);

    // Build context-aware system message
    const systemMessage = buildSystemMessage(contactContexts);

    // Call GLM-4.7-flash via Z.AI SDK with thinking enabled
    const completion = await zaiClient.complete({
      model: 'glm-4.7-flash',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: intent }
      ],
      thinking: { type: 'enabled' }
    });

    const responseContent = completion.choices[0]?.message?.content;
    
    if (!responseContent) {
      return NextResponse.json(
        { error: 'No response from orchestrator' },
        { status: 500 }
      );
    }

    // Parse the orchestration result
    let orchestrationResult;
    try {
      orchestrationResult = JSON.parse(responseContent);
    } catch {
      // If not valid JSON, wrap it in our expected format
      orchestrationResult = {
        orchestration: {
          intent: intent,
          confidence: 0.8,
          actions: [],
          summary: responseContent
        }
      };
    }

    return NextResponse.json({
      success: true,
      result: orchestrationResult,
      thinking: completion.choices[0]?.thinking || null
    });

  } catch (error) {
    console.error('Intent processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process intent' },
      { status: 500 }
    );
  }
}

function extractContactsFromIntent(intent: string): string[] {
  const contacts = Object.keys(personalContext.contacts);
  const lowerIntent = intent.toLowerCase();
  
  return contacts.filter(contact => 
    lowerIntent.includes(contact.toLowerCase())
  );
}

function buildSystemMessage(contactContexts: any[]): string {
  const baseMessage = `You are an Intent Orchestrator. Your role is to analyze user intents and decompose them into a sequence of coordinated actions across multiple services (Uber, OpenTable, Calendar).

Rules:
1. Always output valid JSON with an "orchestration" object containing: intent, confidence (0-1), actions array, and summary
2. Actions must include: service, action, status, and details
3. Use thinking to determine the optimal sequence of actions
4. Apply personal context and preferences to customize the orchestration
5. Services: opentable (reservations), uber (transportation), calendar (events), personal_context (preferences)
6. Status values: confirmed, scheduled, created, applied, completed, pending

Personal Context Available:`;

  if (contactContexts.length === 0) {
    return `${baseMessage}
No specific contacts mentioned. Use general preferences.`;
  }

  const contextDetails = contactContexts.map(ctx => `
- ${ctx.name} (${ctx.relationship}):
  - Cuisine: ${ctx.preferences.cuisine.join(', ')}
  - Allergies: ${ctx.preferences.allergies.join(', ') || 'None'}
  - Ambiance: ${ctx.preferences.ambiance.join(', ')}
  - Notes: ${ctx.preferences.notes.join('; ')}`).join('\n');

  return `${baseMessage}${contextDetails}

Apply these preferences when making reservations or plans involving these contacts.`;
}
