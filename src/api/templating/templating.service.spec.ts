import { expect, test } from "vitest";
import { templateMap } from "./templates";
import { applyTemplates } from "./templating.service";

test("applying all templates", async () => {
  const allTemplates = Array.from(templateMap.keys()).join("\n");
  const result = await applyTemplates(allTemplates);
  expect(result).toBeDefined();
  expect(result).toBeTypeOf("string");

  // Verify each template was replaced (not just with the placeholder)
  for (const placeholder of templateMap.keys()) {
    expect(result).not.toContain(placeholder);
  }
});
