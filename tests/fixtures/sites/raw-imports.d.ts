// `?raw` imports return the file contents as a string; Vitest does this
// natively. The offer page reader's test reads the saved pages and its own
// source this way, since a domain test does no I/O of its own (AD-1).
declare module "*.html?raw" {
  const content: string;
  export default content;
}
declare module "*.ts?raw" {
  const content: string;
  export default content;
}
