import { expect, test } from "bun:test";
import { renderAssistantMarkdownToHtml } from "@/lib/markdown";

test("renders markdown to safe html for assistant messages", async () => {
  const html = await renderAssistantMarkdownToHtml("**Hola**\n\n- uno\n- dos");

  expect(html).toContain("<strong>Hola</strong>");
  expect(html).toContain("<ul>");
  expect(html).not.toContain("<script>");
});
