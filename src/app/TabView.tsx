import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Song } from "../parser";
import { obterNarrador, type BlocoNarrado } from "../narrador";
import { Tocador } from "./audio";
import type { Preferencias } from "./preferencias";

interface Props {
  titulo: string;
  fonteUrl: string | null;
  song: Song;
  prefs: Preferencias;
  onPrefs: (p: Preferencias) => void;
  /** Botões extras na barra de opções, como Exportar. */
  acoes?: ComponentChildren;
}

const CAMPOS = "button, a, input, select, textarea";

/**
 * A tela da tab. Leitura e prática são a mesma coisa: no modo de navegação do NVDA, tudo
 * funciona com títulos, listas e botões; no modo de foco, as setas andam pela tab.
 */
export function TabView({ titulo, fonteUrl, song, prefs, onPrefs, acoes }: Props) {
  const narracao = useMemo(() => obterNarrador(prefs.narrador).narrar(song, prefs), [song, prefs]);
  const raiz = useRef<HTMLElement>(null);
  const tocador = useMemo(() => new Tocador(), []);
  const [tocando, setTocando] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  useEffect(() => () => tocador.parar(), [tocador]);

  const unicaSemNome = narracao.secoes.length === 1 && narracao.secoes[0]!.semNome;
  const blocosPorChave = new Map<string, BlocoNarrado>();
  narracao.secoes.forEach((s, i) => s.blocos.forEach((b, j) => blocosPorChave.set(`${i}-${j}`, b)));

  function anunciar(texto: string) {
    // Limpa antes, para o NVDA falar de novo mesmo se o texto se repetir.
    setAnuncio("");
    setTimeout(() => setAnuncio(texto), 30);
  }

  async function tocar(chave: string) {
    const bloco = blocosPorChave.get(chave);
    if (!bloco) return;
    if (tocando === chave) {
      tocador.parar();
      setTocando(null);
      return;
    }
    setTocando(chave);
    await tocador.tocar(bloco.compassos[0]!, prefs);
    setTocando((atual) => (atual === chave ? null : atual));
  }

  const todos = (seletor: string, dentro: ParentNode | null = raiz.current) =>
    dentro ? [...dentro.querySelectorAll<HTMLElement>(seletor)] : [];

  function focarBloco(bloco: HTMLElement, mudouSecao: boolean) {
    const titulo = bloco.querySelector<HTMLElement>("h3")!;
    // Por um instante, o título do compasso também diz a seção (se mudou) e o comentário
    // da tab (se houver), e o NVDA fala tudo junto.
    const partes: string[] = [];
    const secao = mudouSecao ? bloco.closest<HTMLElement>("[data-secao]")?.dataset.titulo : undefined;
    if (secao) partes.push(secao);
    partes.push(titulo.textContent ?? "");
    if (bloco.dataset.comentario) partes.push(`comentário: ${bloco.dataset.comentario}`);
    if (partes.length > 1) {
      titulo.setAttribute("aria-label", partes.join(", "));
      titulo.addEventListener("blur", () => titulo.removeAttribute("aria-label"), { once: true });
    }
    titulo.focus();
  }

  function aoTeclar(e: KeyboardEvent) {
    const alvo = e.target as HTMLElement;
    if (e.altKey || e.metaKey || e.shiftKey) return;
    if (alvo.closest("input, select, textarea")) return;
    const blocos = todos("[data-bloco]");
    const blocoAtual = alvo.closest<HTMLElement>("[data-bloco]");
    const i = blocoAtual ? blocos.indexOf(blocoAtual) : -1;
    const secaoDe = (b: HTMLElement | undefined) => b?.closest("[data-secao]") ?? null;

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.ctrlKey) {
      e.preventDefault();
      let destino: HTMLElement | undefined;
      if (e.key === "ArrowDown") destino = blocos[i + 1];
      else destino = i > 0 ? blocos[i - 1] : undefined;
      if (!destino) {
        if (i === -1 && e.key === "ArrowDown" && blocos[0]) destino = blocos[0];
        else return anunciar(e.key === "ArrowDown" ? "Fim da tab" : "Início da tab");
      }
      focarBloco(destino, !unicaSemNome && secaoDe(destino) !== secaoDe(blocoAtual ?? undefined));
      return;
    }

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.ctrlKey) {
      if (unicaSemNome) return;
      e.preventDefault();
      const secoes = todos("[data-secao]");
      const atual = alvo.closest<HTMLElement>("[data-secao]");
      const k = atual ? secoes.indexOf(atual) : -1;
      const naProprioTitulo = atual && alvo === atual.querySelector("h2");
      let destino: HTMLElement | undefined;
      if (e.key === "ArrowDown") destino = secoes[k + 1];
      else destino = naProprioTitulo || !atual ? secoes[k - 1] : atual;
      if (!destino) return anunciar(e.key === "ArrowDown" ? "Última seção" : "Primeira seção");
      destino.querySelector<HTMLElement>("h2")!.focus();
      return;
    }

    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (e.ctrlKey) return;
      e.preventDefault();
      const bloco = blocoAtual ?? blocos[0];
      if (!bloco) return;
      const itens = todos("[data-item]", bloco);
      const j = itens.indexOf(alvo);
      if (itens.length === 0) return anunciar("Compasso vazio");
      if (e.key === "ArrowRight") {
        if (j === -1) return itens[0]!.focus();
        if (j === itens.length - 1) return anunciar("Fim do compasso");
        return itens[j + 1]!.focus();
      }
      if (j <= 0) return anunciar("Início do compasso");
      return itens[j - 1]!.focus();
    }

    if (e.key === "Enter" && blocoAtual && !alvo.closest(CAMPOS)) {
      e.preventDefault();
      void tocar(blocoAtual.dataset.bloco!);
      return;
    }

    if (e.key === "Escape" && tocando) {
      tocador.parar();
      setTocando(null);
    }
  }

  function irParaCompasso(e: Event, numero: number) {
    e.preventDefault();
    const bloco = todos("[data-bloco]").find((b) => b.dataset.compassos!.split(" ").includes(String(numero)));
    if (bloco) focarBloco(bloco, false);
  }

  return (
    <article ref={raiz} class="tab" onKeyDown={aoTeclar}>
      <h1 tabIndex={-1} id="titulo-pagina">
        {titulo}
      </h1>
      <p>{narracao.resumo}</p>
      {fonteUrl && (
        <p>
          <a href={fonteUrl}>Tab original</a>
        </p>
      )}

      {narracao.avisos.length > 0 && (
        <>
          <h2>Avisos</h2>
          <ul>
            {narracao.avisos.map((a, i) => (
              <li key={i}>
                {a.compasso !== null ? (
                  <a href={`#compasso-${a.compasso}`} onClick={(e) => irParaCompasso(e, a.compasso!)}>
                    {a.texto}
                  </a>
                ) : (
                  a.texto
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div class="opcoes">
        <label>
          Leitura da nota{" "}
          <select
            value={prefs.leitura}
            onChange={(e) => onPrefs({ ...prefs, leitura: (e.target as HTMLSelectElement).value as Preferencias["leitura"] })}
          >
            <option value="posicao">Corda e casa</option>
            <option value="nome">Nome da nota</option>
            <option value="ambos">Os dois</option>
          </select>
        </label>
        <label>
          Andamento{" "}
          <input
            type="number"
            min={30}
            max={240}
            step={5}
            value={prefs.bpm}
            onChange={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (v >= 30 && v <= 240) onPrefs({ ...prefs, bpm: v });
            }}
          />
        </label>
        {acoes}
      </div>

      {narracao.secoes.map((secao, i) => {
        const conteudo = secao.blocos.map((bloco, j) => {
          const chave = `${i}-${j}`;
          return (
            <div
              key={chave}
              class="bloco"
              data-bloco={chave}
              data-compassos={bloco.compassos.map((c) => c.number).join(" ")}
              data-comentario={bloco.comentarios.join(". ") || undefined}
            >
              <h3 tabIndex={-1} id={`compasso-${bloco.compassos[0]!.number}`}>
                {bloco.titulo}
              </h3>
              {bloco.comentarios.map((c, k) => (
                <p key={k} class="comentario">
                  Comentário: {c}
                </p>
              ))}
              <button type="button" onClick={() => void tocar(chave)}>
                {tocando === chave ? "Parar" : bloco.rotuloTocar}
              </button>
              {bloco.itens.length > 0 && (
                <ol>
                  {bloco.itens.map((item, k) => (
                    <li key={k} tabIndex={-1} data-item>
                      {item.texto}
                    </li>
                  ))}
                </ol>
              )}
              {bloco.comentariosDepois.map((c, k) => (
                <p key={k} class="comentario">
                  Comentário no fim da tab: {c}
                </p>
              ))}
            </div>
          );
        });
        return (
          <section key={i} data-secao data-titulo={secao.titulo}>
            {!unicaSemNome && <h2 tabIndex={-1}>{secao.titulo}</h2>}
            {conteudo}
          </section>
        );
      })}

      <div class="leitor" aria-live="polite">
        {anuncio}
      </div>
    </article>
  );
}
