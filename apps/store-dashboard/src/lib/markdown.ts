import { init, renderToHtml, renderToMarkdown } from "md4x";

const md4xReady = init().catch(() => undefined);

export const renderAssistantMarkdownToHtml = async (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  try {
    await md4xReady;
    const cleanedMarkdown = renderToMarkdown(trimmed, { heal: true });
    return renderToHtml(cleanedMarkdown, { heal: true }).trim();
  } catch {
    return "";
  }
};
