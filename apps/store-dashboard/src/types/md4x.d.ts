declare module "md4x" {
  export interface RenderOptions {
    heal?: boolean;
  }

  export interface HtmlOptions extends RenderOptions {
    full?: boolean;
  }

  export function init(): Promise<void>;
  export function renderToHtml(input: string, opts?: HtmlOptions): string;
  export function renderToMarkdown(input: string, opts?: RenderOptions): string;
}
