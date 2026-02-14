import { ToolRegistry, getToolRegistry } from "./tools/registry";
import { MCPClient } from "../../infrastructure/mcp/MCPClient";
import { ToolDefinition } from "./types";
import { Tracer } from "./tracing";
import { getMemoryClient } from "./memory";
import { mcpConfig } from "../mcp-config";

/**
 * RegistryManager coordinates local and remote tool discovery.
 */
export class RegistryManager {
  private localRegistry: ToolRegistry;
  private mcpClients: Map<string, MCPClient> = new Map();

  constructor() {
    this.localRegistry = getToolRegistry();
    
    // Initialize MCP clients from environment
    if (process.env.GITHUB_MCP_URL) {
      this.mcpClients.set("github", new MCPClient(process.env.GITHUB_MCP_URL));
    }
    if (process.env.BRAVE_SEARCH_MCP_URL) {
      this.mcpClients.set("brave-search", new MCPClient(process.env.BRAVE_SEARCH_MCP_URL));
    }
    if (process.env.VERCEL_MCP_URL) {
      this.mcpClients.set("vercel", new MCPClient(process.env.VERCEL_MCP_URL));
    }
    
    // OpenDeliver uses mcpConfig for transport
    this.mcpClients.set("opendeliver", new MCPClient(mcpConfig.transport.opendeliver));

    if (process.env.TABLESTACK_MCP_URL) {
      this.mcpClients.set("tablestack", new MCPClient(process.env.TABLESTACK_MCP_URL));
    }
  }

  /**
   * Discovers tools from all connected MCP servers and populates the local registry.
   */
  async discoverRemoteTools(): Promise<void> {
    const memory = getMemoryClient();

    return Tracer.startActiveSpan("discover_remote_tools", async (span) => {
      const clients = Array.from(this.mcpClients.entries());
      for (const [name, client] of clients) {
        try {
          await client.connect();
          const remoteTools = await client.listTools();
          const serverKey = `circuit_breaker:mcp:${name}`;
          
          for (const tool of remoteTools) {
            // Register a wrapper implementation that calls the MCP server
            // Note: Registry.register already validates the ToolDefinition
            this.localRegistry.register(tool, async (params, context) => {
              return Tracer.startActiveSpan(`mcp_tool_call:${tool.name}`, async (toolSpan) => {
                // 1. Check Circuit Breaker
                const failCount = await memory.getCounter(serverKey);
                if (failCount >= 3) {
                  return {
                    success: false,
                    error: `Circuit breaker tripped for MCP server: ${name}. Too many recent failures.`,
                  };
                }

                try {
                  // Pass trace_id in params if available in context
                  const paramsWithTrace = {
                    ...params,
                    _trace_id: context.executionId
                  };
                  const result = await client.callTool(tool.name, paramsWithTrace, context.abortSignal);
                  
                  return {
                    success: true,
                    output: result,
                  };
                } catch (error: any) {
                  // 2. Increment Failure Counter
                  await memory.incrementCounter(serverKey, 60); // 60s window
                  
                  return {
                    success: false,
                    error: error.message || `Failed to call remote tool ${tool.name}`,
                  };
                }
              });
            });
          }
          console.log(`Discovered ${remoteTools.length} tools from MCP server: ${name}`);
        } catch (error) {
          console.error(`Failed to discover tools from MCP server ${name}:`, error);
        }
      }
    });
  }

  /**
   * Lists all available tools (local and discovered remote).
   */
  listAllTools(): ToolDefinition[] {
    return this.localRegistry.list();
  }

  /**
   * Gets tool names for planning constraints.
   */
  getAllToolNames(): string[] {
    return this.listAllTools().map(t => t.name);
  }
}

// Singleton instance
let globalRegistryManager: RegistryManager | null = null;

export function getRegistryManager(): RegistryManager {
  if (!globalRegistryManager) {
    globalRegistryManager = new RegistryManager();
  }
  return globalRegistryManager;
}
