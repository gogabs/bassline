// Teste de ponta a ponta no Chrome: converte uma tab, navega pelo teclado como no modo de foco
// do NVDA e roda o axe-core em cada tela. Precisa do build: npm run build && npm run test:e2e
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");

const PORTA = 8799;
const BASE = `http://localhost:${PORTA}`;
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const TAB = `[Intro]
G|----------------|----------------|
D|----------------|------------5-7-|
A|-----------3h5--|--3-3-3-3-------|
E|-3-3-3-3--------|----------------|

[Refrão]
G|-----7~--|
D|-5/7-----|
A|---------|
E|-0-------|
`;

async function axe(page, tela) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }));
  const problemas = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  assert.deepEqual(problemas, [], `axe-core encontrou problemas na tela ${tela}`);
}

const ativo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return { tag: el.tagName, texto: el.getAttribute("aria-label") ?? el.textContent.trim() };
});

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
    await page.goto(BASE);
    await axe(page, "Início");

    // Site não suportado: a mensagem aparece e o foco volta para o campo.
    await page.fill("#entrada", "https://exemplo.com/tab");
    await page.click("button[type=submit]");
    await page.waitForSelector("#erro");
    assert.match(await page.textContent("#erro"), /Ainda não sei ler esse site/);
    assert.equal((await ativo(page)).tag, "TEXTAREA");

    await page.fill("#entrada", TAB);
    await page.fill("#nome", "Riff de teste");
    await page.click("button[type=submit]");
    await page.waitForSelector("h1:has-text('Riff de teste')");
    assert.equal((await ativo(page)).texto, "Riff de teste");
    await axe(page, "Tab");

    // Baixo e Cima: compassos. Direita e Esquerda: símbolos.
    // Do topo para o primeiro compasso, o título também diz a seção.
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await ativo(page), { tag: "H3", texto: "Intro, Compasso 1" });
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await ativo(page), { tag: "LI", texto: "E3, 4 vezes" });
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await ativo(page), { tag: "LI", texto: "A3, hammer para 5" });
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".leitor").textContent === "Fim do compasso");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await ativo(page), { tag: "H3", texto: "Compasso 2" });
    // Mudou de seção: o título fala a seção junto.
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await ativo(page), { tag: "H3", texto: "Refrão, Compasso 3" });
    await page.keyboard.press("ArrowUp");
    assert.deepEqual(await ativo(page), { tag: "H3", texto: "Intro, Compasso 2" });

    // Ctrl mais Baixo e Cima: seções.
    await page.keyboard.press("Control+ArrowDown");
    assert.deepEqual(await ativo(page), { tag: "H2", texto: "Refrão" });
    await page.keyboard.press("Control+ArrowUp");
    assert.deepEqual(await ativo(page), { tag: "H2", texto: "Intro" });

    // Enter toca o compasso.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-bloco='0-0'] button:has-text('Parar')");
    await page.keyboard.press("Escape");

    // Trocar a leitura muda o texto na hora.
    await page.selectOption("select", "nome");
    assert.equal(await page.textContent("li[data-item]"), "Sol, 4 vezes");

    // Tab do Cifra Club com caracteres invisíveis no começo das linhas e comentários.
    const suja = readFileSync(join(__dirname, "..", "src", "parser", "exemplos", "cifraclub-comentarios.txt"), "utf8")
      .split("\n")
      .map((l) => (l ? "\u00a0\u200b" + l : l))
      .join("\n");
    await page.goto(BASE);
    await page.fill("#entrada", suja);
    await page.fill("#nome", "Tab com comentários");
    await page.click("button[type=submit]");
    await page.waitForSelector("h1:has-text('Tab com comentários')");
    assert.deepEqual(await page.$$eval("h2", (hs) => hs.map((h) => h.textContent)), ["Introdução verso e refrões", "Ponte"]);
    assert.equal(
      await page.textContent("[data-bloco='0-1'] .comentario"),
      "Comentário: seria bom variar as vezes",
    );
    await axe(page, "Tab com comentários");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await ativo(page), {
      tag: "H3",
      texto: "Compasso 2, comentário: seria bom variar as vezes",
    });

    await page.click("a[href='#/config']");
    await page.waitForSelector("h1:has-text('Configurações')");
    await axe(page, "Configurações");
    console.log("Todos os testes de teclado e acessibilidade passaram.");
  } catch (e) {
    falhou = true;
    console.error(e.message);
  } finally {
    await browser.close();
    servidor.kill();
  }
  process.exit(falhou ? 1 : 0);
})();
