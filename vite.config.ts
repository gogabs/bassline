import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * Os arquivos do onnxruntime-web que carregam o WebAssembly ficam fora do pacote, em /ort/.
 * Empacotados, as threads do WebAssembly carregariam o código do trabalhador inteiro e travariam.
 */
const ORT = join(import.meta.dirname, "node_modules", "onnxruntime-web", "dist");
const ARQUIVOS_ORT = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
function arquivosOrt(): Plugin {
  return {
    name: "bassline-ort",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const nome = req.url?.match(/^\/ort\/([^?]+)/)?.[1];
        if (!nome || !ARQUIVOS_ORT.includes(nome)) return next();
        res.setHeader("content-type", nome.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(join(ORT, nome)));
      });
    },
    generateBundle() {
      for (const nome of ARQUIVOS_ORT) this.emitFile({ type: "asset", fileName: `ort/${nome}`, source: readFileSync(join(ORT, nome)) });
    },
  };
}

// Isolamento de origem: deixa a separação do baixo usar várias threads.
const isolamento = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
};

export default defineConfig({
  plugins: [preact(), arquivosOrt()],
  server: {
    // Em desenvolvimento, o mini servidor roda em paralelo (npm run servidor).
    proxy: { "/api": "http://localhost:8787" },
    headers: isolamento,
  },
  preview: { headers: isolamento },
  worker: { format: "es" },
  // O onnxruntime-web carrega os próprios arquivos .wasm; o pré-empacotamento do Vite atrapalha.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"] },
} as never);
