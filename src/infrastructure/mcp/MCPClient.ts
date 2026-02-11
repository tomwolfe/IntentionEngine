import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { ToolDefinition } from "../../lib/engine/types";
import { z } from "zod";

/**
 * MCPClient connects to remote MCP servers and maps their tools 
 * to the engine's internal ToolDefinition format.
 */
export class MCPClient {
  private client: Client;
  private transport: SSEClientTransport;
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.transport = new SSEClientTransport(new URL(serverUrl));
    this.client = new Client(
      {
        name: "IntentionEngine-Orchestrator",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * Initialize the connection to the MCP server.
   */
  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    await this.client.close();
  }

  /**
   * Lists tools from the remote MCP server and converts them to Engine ToolDefinitions.
   */
  async listTools(): Promise<ToolDefinition[]> {
    const response = await this.client.listTools();
    return response.tools.map((tool) => this.mapMcpToolToEngineTool(tool));
  }

  /**
   * Calls a tool on the remote MCP server with exponential backoff retry.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    return this.withRetry(async () => {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      return result;
    });
  }

  /**
   * Exponential backoff with jitter retry strategy.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) break;
        
        // Exponential backoff: baseDelay * 2^(attempt-1) + jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Maps an MCP tool definition to the engine's ToolDefinition.
   */
  private mapMcpToolToEngineTool(tool: McpTool): ToolDefinition {
    // Attempt to derive return_schema from non-standard MCP metadata if available
    const return_schema = (tool as any).outputSchema || (tool as any).returnSchema || {};

    return {
      name: tool.name,
      version: "1.0.0",
      description: tool.description || "",
      inputSchema: {
        type: "object",
        properties: (tool.inputSchema as any).properties || {},
        required: (tool.inputSchema as any).required || [],
      },
      return_schema: return_schema as Record<string, unknown>,
      timeout_ms: 30000,
      requires_confirmation: false,
      category: "external",
      origin: this.serverUrl,
    };
  }

  /**
   * Recursive helper to map JSON Schema to Zod for deep validation.
   */
  public mapJsonSchemaToZod(schema: any): z.ZodTypeAny {
    if (!schema) return z.any();

    switch (schema.type) {
      case "string":
        if (schema.enum) {
          return z.enum(schema.enum as [string, ...string[]]);
        }
        return z.string();
      case "number":
      case "integer":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(this.mapJsonSchemaToZod(schema.items || {}));
      case "object":
        const shape: any = {};
        const properties = schema.properties || {};
        const required = schema.required || [];

        for (const [key, value] of Object.entries(properties)) {
          let fieldSchema = this.mapJsonSchemaToZod(value);
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }
          shape[key] = fieldSchema;
        }
        return z.object(shape);
      default:
        return z.any();
    }
  }
}
