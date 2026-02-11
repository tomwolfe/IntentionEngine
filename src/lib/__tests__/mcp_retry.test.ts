import { MCPClient } from "../../infrastructure/mcp/MCPClient";

async function testMcpRetry() {
  console.log("--- TEST: MCP Retry Logic ---");
  
  // Use a dummy URL, we will mock the internal client
  const client = new MCPClient("http://localhost:8080");
  
  let attempts = 0;
  // Mock callTool to fail twice and succeed on third attempt
  (client as any).client = {
    callTool: async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("429 Too Many Requests");
      }
      return { content: [{ type: "text", text: "Success" }] };
    },
    connect: async () => {},
    close: async () => {}
  };

  try {
    const result = await client.callTool("test_tool", {});
    console.log(`Attempts: ${attempts}`);
    if (attempts === 3 && result.content[0].text === "Success") {
      console.log("PASS: MCP Retry Logic works.");
    } else {
      console.error(`FAIL: Expected 3 attempts, got ${attempts}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("FAIL: MCP Retry failed:", error);
    process.exit(1);
  }
}

testMcpRetry().catch(err => {
  console.error(err);
  process.exit(1);
});
