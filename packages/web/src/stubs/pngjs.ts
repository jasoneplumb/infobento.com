// Browser stub for the Node-only `pngjs` package. The web preview renders
// via <canvas>, so the PNG encoder pulled in transitively by @infobento/renderer
// is never actually called at runtime — but the import must still resolve.
function unavailable(): never {
  throw new Error('pngjs is not available in the browser build');
}

export const PNG = function PNG(): never {
  return unavailable();
} as unknown as { new (): never };
