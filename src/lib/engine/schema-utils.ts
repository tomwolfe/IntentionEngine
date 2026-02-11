import { z } from "zod";

/**
 * Recursive helper to map JSON Schema to Zod for deep validation.
 */
export function mapJsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || Object.keys(schema).length === 0) return z.any();

  const type = schema.type as string | undefined;

  switch (type) {
    case "string":
      if (Array.isArray(schema.enum)) {
        return z.enum(schema.enum as [string, ...string[]]);
      }
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      const items = schema.items as Record<string, unknown> | undefined;
      return z.array(mapJsonSchemaToZod(items || {}));
    case "object":
      const shape: Record<string, z.ZodTypeAny> = {};
      const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
      const required = (schema.required as string[]) || [];

      for (const [key, value] of Object.entries(properties)) {
        let fieldSchema = mapJsonSchemaToZod(value);
        if (!required.includes(key)) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
      return z.object(shape);
    default:
      // Handle cases where type might be missing but properties exist (implicit object)
      if (schema.properties) {
        return mapJsonSchemaToZod({ ...schema, type: "object" });
      }
      return z.any();
  }
}
