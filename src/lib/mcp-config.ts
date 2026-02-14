/**
 * MCP Transport and Parameter Configuration
 */
export const mcpConfig = {
  transport: {
    opendeliver: process.env.OPENDELIVER_URL || 'http://localhost:3001',
    tablestack: process.env.TABLESTACK_MCP_URL || 'http://localhost:3002/api/mcp',
  },
  parameter_aliases: {
    "restaurant_id": "venue_id",
    "merchant_id": "venue_id",
  }
};
