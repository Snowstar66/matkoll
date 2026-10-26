// `?raw` imports return the file contents as a string; Vitest does this
// natively. The basket export's test reads its golden file this way, since a
// domain test does no I/O of its own (AD-1).
declare module "*.txt?raw" {
  const content: string;
  export default content;
}
