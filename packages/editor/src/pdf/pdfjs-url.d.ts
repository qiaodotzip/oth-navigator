// Vite turns a `?url` import into the URL of the file it emits.
declare module "*?url" {
  const url: string;
  export default url;
}
