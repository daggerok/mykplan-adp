// font files imported from TypeScript resolve to their URL (Bun loader 'file')
declare module '*.woff2' {
  const url: string;
  export default url;
}
