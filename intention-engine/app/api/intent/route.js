import ZAIClient from '@/lib/zai-sdk-mock';
import { personalContext } from '@/lib/personal-context';
import { ServiceOrchestrator } from '@/services/orchestrator';

const client = new ZAIClient(process.env.ZAI_API_KEY);

export async function POST(request) {
  try {
    const { intent } = await request.json();

    // Extract contact name from intent to get specific context
    let contactContext = personalContext.contacts.sarah; // default to Sarah

    // If we can identify a different contact in the intent, use their context
    Object.keys(personalContext.contacts).forEach(contactKey => {
      if (intent.toLowerCase().includes(contactKey)) {
        contactContext = personalContext.contacts[contactKey];
      }
    });

    // Prepare the system message to act as an orchestrator
    const systemMessage = {
      role: "system",
      content: `You are an intelligent orchestrator that takes a user's intent and breaks it down into specific actions across multiple services.

Based on the user's request, determine what services need to be called and generate a structured JSON plan.
Consider the user's personal context: ${JSON.stringify(contactContext)}.

Respond with a JSON object containing an "actions" array with the following structure:
[
  {
    "service": "Service name (e.g. OpenTable, Uber, Calendar)",
    "action": "Specific action to perform",
    "params": { ...action parameters }
  }
]`
    };

    const userMessage = {
      role: "user",
      content: intent
    };

    // Call the Z.AI completion API with thinking enabled
    const response = await client.completion({
      messages: [systemMessage, userMessage],
      thinking: { type: 'enabled' }
    });

    const plan = JSON.parse(response.choices[0].message.content);

    // Execute the planned actions
    const executionResults = await ServiceOrchestrator.executePlan(plan.actions);

    // Format the response with both the plan and execution results
    const result = {
      original_intent: intent,
      plan: plan,
      execution_results: executionResults
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Intent processing error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process intent', details: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}