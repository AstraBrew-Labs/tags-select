# Dependency Patches

`animal-island-ui@2.1.1.patch` makes the library's notification root use
`react-dom/client` directly in both ESM and CommonJS builds. The bundled React 18
adapter calls `react-dom.createRoot`, which is unavailable in React 19.

Bun applies this patch during installation through `patchedDependencies`.
Keep it until an upstream release fixes the adapter, and verify global messages
in both development and production before removing it.
