import { z, ZodType } from "zod";
import { SendEmailSchema } from "./tools/email";
import { GenerateDocumentSchema } from "./tools/document";
import { LookupDataSchema } from "./tools/data_lookup";

export type SecurityLevel = 'basic' | 'sensitive' | 'critical';

export type ToolMetadata = {
  name: string;
  version: string;
  description: string;
  securityLevel: SecurityLevel;
  parameters: Record<string, ZodType>;
  requiresConfirmation: boolean;
};

const toolRegistry: Record<string, ToolMetadata> = {};
const securityApprovedTools = new Set<string>(['geocode_location', 'search_restaurant', 'add_calendar_event', 'send_email', 'generate_document', 'lookup_data']);

export function registerTool(name: string, metadata: ToolMetadata) {
  if (metadata.securityLevel === 'critical' && !securityApprovedTools.has(name)) {
    throw new Error(`Critical tool ${name} requires security review and approval`);
  }
  toolRegistry[name] = metadata;
}

// Initial Registration
registerTool('geocode_location', {
  name: 'geocode_location',
  version: '1.0.0',
  description: 'Converts a city or place name to lat/lon coordinates.',
  securityLevel: 'basic',
  parameters: { location: z.string() },
  requiresConfirmation: false,
});

registerTool('search_restaurant', {
  name: 'search_restaurant',
  version: '1.0.0',
  description: 'Search for restaurants nearby based on cuisine and location.',
  securityLevel: 'basic',
  parameters: { 
    cuisine: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    location: z.string().optional()
  },
  requiresConfirmation: false,
});

registerTool('add_calendar_event', {
  name: 'add_calendar_event',
  version: '1.0.0',
  description: 'Add an event to the user\'s calendar.',
  securityLevel: 'sensitive',
  parameters: { 
    title: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    location: z.string().optional(),
    restaurant_name: z.string().optional(),
    restaurant_address: z.string().optional()
  },
  requiresConfirmation: true,
});

registerTool('send_email', {
  name: 'send_email',
  version: '1.0.0',
  description: 'Send an email.',
  securityLevel: 'sensitive',
  parameters: {
    to: z.string().email(),
    subject: z.string(),
    body: z.string()
  },
  requiresConfirmation: true,
});

registerTool('generate_document', {
  name: 'generate_document',
  version: '1.0.0',
  description: 'Generate a document.',
  securityLevel: 'basic',
  parameters: {
    title: z.string(),
    content: z.string(),
    type: z.enum(["pdf", "txt", "markdown"]).default("txt")
  },
  requiresConfirmation: false,
});

registerTool('lookup_data', {
  name: 'lookup_data',
  version: '1.0.0',
  description: 'Lookup data in various categories.',
  securityLevel: 'basic',
  parameters: {
    query: z.string(),
    category: z.string().optional()
  },
  requiresConfirmation: false,
});

export function getToolMetadata(name: string): ToolMetadata | null {
  return toolRegistry[name] || null;
}

export function getAllTools(): ToolMetadata[] {
  return Object.values(toolRegistry);
}

export function checkPermission(toolName: string, userRole: string = 'user'): boolean {
  const tool = getToolMetadata(toolName);
  if (!tool) return false;

  if (tool.securityLevel === 'critical' && userRole !== 'admin') {
    return false;
  }
  
  if (tool.securityLevel === 'sensitive' && userRole === 'guest') {
    return false;
  }

  return true;
}
