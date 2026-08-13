import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

// Stub out the heavy WASM-based radix-engine-toolkit in the SSR environment.
// It only runs client-side (browser wallet interactions) so the server just
// needs an empty module to avoid bundling ~8MB of WASM.
function stubWasmForSsr(): import('vite').Plugin {
  // Provide no-op stubs for all named exports used by downstream packages
  // (rola, tx-tool, radix-effects). These never execute server-side.
  const STUB = `
    const noop = () => { throw new Error('radix-engine-toolkit is client-only') };
    const noopClass = class { constructor() { throw new Error('radix-engine-toolkit is client-only') } };
    export const RadixEngineToolkit = new Proxy({}, { get: () => noop });
    export const PublicKey = noopClass;
    export const PrivateKey = noopClass;
    export const Signature = noopClass;
    export const SignatureWithPublicKey = noopClass;
    export const TransactionBuilder = new Proxy({}, { get: () => noop });
    export const Convert = new Proxy({}, { get: () => noop });
    export const generateRandomNonce = noop;
    export default RadixEngineToolkit;
  `

  return {
    name: 'stub-wasm-ssr',
    enforce: 'pre',
    applyToEnvironment(environment) {
      return environment.name === 'ssr'
    },
    resolveId(id) {
      if (id === '@radixdlt/radix-engine-toolkit' || id.startsWith('@radixdlt/radix-engine-toolkit/')) {
        console.log('[stub-wasm-ssr] intercepting:', id)
        return { id: '\0stub:radix-engine-toolkit', moduleSideEffects: false }
      }
    },
    load(id) {
      if (id === '\0stub:radix-engine-toolkit') {
        console.log('[stub-wasm-ssr] loading stub')
        return STUB
      }
    },
  }
}

const config = defineConfig({
  plugins: [
    stubWasmForSsr(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
