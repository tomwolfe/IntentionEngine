import { NextRequest, NextResponse } from 'next/server';
import { McpManager } from '@/infrastructure/McpManager';
import { listTools } from '@/lib/tools';

// Instantiate McpManager with all registered tools
const mcpManager = new McpManager(listTools());

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, params, id } = body;

    if (method === 'notifications/initialized') {
        return new NextResponse(null, { status: 204 });
    }

    if (method === 'tools/list') {
      const result = await mcpManager.listTools();
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const result = await mcpManager.callTool(name, args);
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    }, { status: 404 });

  } catch (error: any) {
    console.error('MCP Error:', error);
    return NextResponse.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message || 'Internal error',
      },
    }, { status: 500 });
  }
}
