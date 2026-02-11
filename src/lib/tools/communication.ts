import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";

export const CommunicationSchema = z.object({
  recipient: z.string().describe("The email address or phone number of the recipient."),
  channel: z.enum(["email", "sms"]).describe("The communication channel to use."),
  message: z.string().describe("The content of the message."),
  subject: z.string().optional().describe("The subject of the email (ignored for SMS).")
});

export type CommunicationParams = z.infer<typeof CommunicationSchema>;

export const communicationToolParameters: ToolParameter[] = [
  {
    name: "recipient",
    type: "string",
    description: "The email address or phone number of the recipient.",
    required: true
  },
  {
    name: "channel",
    type: "string",
    description: "The communication channel to use.",
    required: true,
    enum_values: ["email", "sms"]
  },
  {
    name: "message",
    type: "string",
    description: "The content of the message.",
    required: true
  },
  {
    name: "subject",
    type: "string",
    description: "The subject of the email (ignored for SMS).",
    required: false
  }
];

export const communicationReturnSchema = {
  status: "string",
  channel: "string",
  recipient: "string",
  timestamp: "string"
};

export async function send_comm(params: CommunicationParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = CommunicationSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + validated.error.message };
  }
  
  const { recipient, channel, message, subject } = validated.data;
  console.log(`Sending ${channel} to ${recipient}...`);
  
  try {
    // Placeholder for actual communication API integration
    // In production, this would integrate with SendGrid, Twilio, etc.
    // const apiKey = process.env.COMMUNICATION_API_KEY; // Placeholder for API key
    
    return {
      success: true,
      result: {
        status: "sent",
        channel: channel,
        recipient: recipient,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const sendCommToolDefinition: ToolDefinitionMetadata = {
  name: "send_comm",
  version: "1.0.0",
  description: "Sends communication via email or SMS to a specified recipient.",
  parameters: communicationToolParameters,
  return_schema: communicationReturnSchema,
  timeout_ms: 30000,
  requires_confirmation: true,
  category: "communication",
  rate_limits: {
    requests_per_minute: 60,
    requests_per_hour: 500
  },
  responseSchema: z.object({
    status: z.string(),
    channel: z.enum(["email", "sms"]),
    recipient: z.string(),
    timestamp: z.string()
  })
};
