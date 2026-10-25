// `?raw` imports return the file contents as a string: Vite (Vitest) does this
// natively, and next.config.ts has a Turbopack rule for it.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
