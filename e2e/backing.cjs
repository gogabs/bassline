// Teste de ponta a ponta da backing track no Chrome: busca (simulada), download (simulado),
// separação do baixo com a IA de verdade (no processador, sem placa de vídeo) e o tocador.
// Precisa do build: npm run build && npm run test:backing
// Na primeira vez o servidor baixa o modelo (uns 180 MB). BASSLINE_DADOS escolhe a pasta.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");

const PORTA = 8798;
const BASE = `http://localhost:${PORTA}`;
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAB = `G|----------------|\nD|----------------|\nA|-----------3h5--|\nE|-3-3-3-3--------|\n`;

/** WAV estéreo de 9 segundos: notas graves, um acorde e um chimbal. */
function wavDeTeste() {
  const taxa = 44100;
  const n = taxa * 9;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(taxa, 24);
  buf.writeUInt32LE(taxa * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const nota = [41.2, 55, 61.7, 49][Math.floor(t * 2) % 4];
    const baixo = 0.4 * Math.exp(-((t * 2) % 1) * 3) * Math.sin(2 * Math.PI * nota * t);
    const acorde = 0.08 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 554 * t) + Math.sin(2 * Math.PI * 659 * t));
    const chimbal = (t * 4) % 1 < 0.03 ? (Math.random() - 0.5) * 0.3 : 0;
    const v = Math.round(Math.max(-1, Math.min(1, baixo + acorde + chimbal)) * 32767);
    buf.writeInt16LE(v, 44 + i * 4);
    buf.writeInt16LE(v, 46 + i * 4);
  }
  return buf;
}

async function axe(page, tela) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }));
  const problemas = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  assert.deepEqual(problemas, [], `axe-core encontrou problemas na tela ${tela}`);
}

const ativo = (page) => page.evaluate(() => document.activeElement.textContent.trim());

(async () => {
  const servidor = spawn(process.execPath, [join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), "server/index.ts"], {
    env: { ...process.env, PORT: String(PORTA) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((ok) => servidor.stdout.once("data", ok));
  const browser = await chromium.launch();
  let falhou = false;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("Erro na página:", e.message));
    if (process.env.DEPURAR) {
      page.on("console", (m) => console.log("console:", m.text()));
      page.on("worker", (w) => w.on("console", (m) => console.log("trabalhador:", m.text())));
      setInterval(() => page.textContent("[data-backing]").then((t) => console.log("tela:", t)).catch(() => {}), 10_000).unref();
    }
    // O YouTube é simulado: o teste não depende da rede nem do yt-dlp.
    await page.route("**/api/youtube/busca?**", (r) =>
      r.fulfill({ json: { videos: [{ id: "abcdefghijk", titulo: "Riff de teste ao vivo", canal: "Banda", duracao: 9 }] } }),
    );
    await page.route("**/api/youtube/audio?**", (r) => r.fulfill({ body: wavDeTeste(), contentType: "audio/wav" }));

    await page.goto(BASE);
    await page.fill("#entrada", TAB);
    await page.fill("#nome", "Riff de teste");
    await page.click("button[type=submit]");
    await page.waitForSelector("h2:has-text('Backing track')");
    assert.equal(await page.inputValue("#busca-youtube"), "Riff de teste");
    assert.match(await page.textContent("[data-backing]"), /termos de uso/);
    await axe(page, "Backing track vazia");

    // Busca: o foco vai para o título dos resultados.
    await page.click("[data-backing] button[type=submit]");
    await page.waitForSelector("[data-backing] h3");
    assert.equal(await ativo(page), "1 vídeo encontrado");
    await page.click("text=Riff de teste ao vivo, Banda, 9 segundos");

    // Separação de verdade. Sem placa de vídeo, cada trecho leva uns segundos.
    await page.waitForSelector("text=Cancelar");
    await page.waitForSelector("button:has-text('Tocar backing track')", { timeout: Number(process.env.LIMITE ?? 10 * 60_000) });
    assert.equal(await ativo(page), "Tocar backing track");
    assert.match(await page.textContent("[data-backing]"), /Áudio do YouTube: Riff de teste ao vivo/);
    await axe(page, "Tocador");

    await page.click("text=Tocar backing track");
    await page.waitForSelector("button:has-text('Pausar')");
    await page.click("text=Pausar");
    await page.click("text=Avançar 5 segundos");
    await page.waitForFunction(() => /segundos/.test([...document.querySelectorAll("[data-backing] .leitor")].map((e) => e.textContent).join(" ")));
    const volume = page.getByLabel("Volume do baixo original");
    await volume.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await volume.getAttribute("aria-valuetext"), "10 por cento");
    await page.waitForSelector("a[download$='baixo em 10 por cento.wav']");

    // Ao abrir de novo, a backing track vem do navegador, sem separar de novo e sem roubar o foco.
    await page.reload();
    await page.waitForSelector("button:has-text('Tocar backing track')");
    assert.notEqual(await ativo(page), "Tocar backing track");

    await page.click("text=Trocar o áudio");
    await page.waitForSelector("#busca-youtube");
    console.log("Todos os testes da backing track passaram.");
  } catch (e) {
    falhou = true;
    console.error(e.message);
  } finally {
    await browser.close();
    servidor.kill();
  }
  process.exit(falhou ? 1 : 0);
})();
