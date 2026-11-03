/**
 * Mini servidor do Bassline.
 *
 * O navegador não pode ler páginas de outros sites, então o app pede a tab para cá:
 * GET /api/tab?url=<link>. O servidor só busca links de sites que têm uma fonte
 * registrada, baixa o HTML, extrai a tab e devolve JSON. Em produção, também serve o
 * app já construído, da pasta dist.
 */
import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fonteDoLink, listarFontes } from "../src/fontes";

const PORTA = Number(process.env.PORT ?? 8787);
const DIST = join(import.meta.dirname, "..", "dist");
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

async function buscarTab(link: string, res: ServerResponse) {
  const achado = fonteDoLink(link);
  if (!achado) {
    const nomes = listarFontes().map((f) => f.nome).join(" e ");
    return json(res, 400, { erro: `Ainda não sei ler esse site. Sites aceitos: ${nomes}. Você pode colar o texto da tab.` });
  }
  const { fonte, url } = achado;
  let html: string;
  try {
    const resposta = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Bassline/0.1)", accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) return json(res, 502, { erro: `O ${fonte.nome} respondeu com erro ${resposta.status}. Você pode colar o texto da tab.` });
    html = await resposta.text();
  } catch {
    return json(res, 502, { erro: `Não consegui abrir a página do ${fonte.nome}. Você pode colar o texto da tab.` });
  }
  try {
    const tab = fonte.extrair(html, url);
    if (!tab.texto) return json(res, 422, { erro: `Não encontrei a tab na página do ${fonte.nome}. Você pode colar o texto da tab.` });
    return json(res, 200, { ...tab, url: url.toString(), fonte: fonte.nome });
  } catch {
    return json(res, 422, { erro: `A página do ${fonte.nome} mudou e não consegui ler a tab. Você pode colar o texto da tab.` });
  }
}

async function servirArquivo(caminho: string, res: ServerResponse) {
  const relativo = normalize(caminho).replace(/^(\.\.[/\\])+/, "");
  const arquivo = join(DIST, relativo === "/" ? "index.html" : relativo);
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { "content-type": TIPOS[extname(arquivo)] ?? "application/octet-stream" });
    res.end(conteudo);
  } catch {
    try {
      res.writeHead(200, { "content-type": TIPOS[".html"] });
      res.end(await readFile(join(DIST, "index.html")));
    } catch {
      res.writeHead(404).end("Não encontrado. Rode npm run build antes.");
    }
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/tab" && req.method === "GET") {
    const link = url.searchParams.get("url");
    if (!link) return json(res, 400, { erro: "Faltou o link da tab." });
    void buscarTab(link, res);
    return;
  }
  void servirArquivo(url.pathname, res);
}).listen(PORTA, () => console.log(`Bassline em http://localhost:${PORTA}`));
