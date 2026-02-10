import { z } from "zod";

export const LookupDataSchema = z.object({
  query: z.string().min(1),
  category: z.string().optional(),
});

export async function lookup_data(params: z.infer<typeof LookupDataSchema>) {
  console.log(`Looking up data for query: ${params.query} in category: ${params.category}`);
  
  // Mock data lookup
  return {
    success: true,
    result: {
      data: [
        { id: 1, name: "Sample Data 1", value: "Value 1" },
        { id: 2, name: "Sample Data 2", value: "Value 2" },
      ],
    }
  };
}
