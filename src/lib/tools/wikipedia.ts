import { z } from "zod";
import { Tool, ToolResult } from "./types";

const WikipediaParams = z.object({
  query: z.string(),
});

type Params = z.infer<typeof WikipediaParams>;

export const wikipediaTool: Tool<Params> = {
  definition: {
    name: "wikipedia_lookup",
    description: "Looks up information on Wikipedia.",
    parameters: WikipediaParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(params.query.replace(/ /g, '_'))}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IntentionEngine/1.0' }
      });
      if (!response.ok) {
        if (response.status === 404) return { success: false, error: "Topic not found on Wikipedia." };
        throw new Error(`Wikipedia API error: ${response.statusText}`);
      }
      const data = await response.json();
      return {
        success: true,
        result: {
          title: data.title,
          extract: data.extract,
          url: data.content_urls?.desktop?.page
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
