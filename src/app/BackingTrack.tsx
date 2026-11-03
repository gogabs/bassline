import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { decodificar, separar, type Separacao } from "../backing/cliente";
import { apagarBacking, lerBacking, salvarBacking, type Origem } from "../backing/guardar";
import type { MensagemDoTrabalhador } from "../backing/mensagens";
import type { Separado } from "../backing/separar";
import { falarFalta, falarTempo } from "../backing/tempo";
import { mixarWav } from "../backing/wav";

interface Video {
  id: string;
  titulo: string;
  canal: string;
  duracao: number | null;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "vazio" }
  | { fase: "trabalhando"; texto: string; progresso: number | null }
  | { fase: "pronto"; faixas: Separado; origem: Origem; nova: boolean };

interface Props {
  tabId: string;
  titulo: string;
}

/**
 * Backing track: a música da tab sem o baixo. O áudio vem do YouTube ou de um arquivo, e o
 * baixo é tirado por uma IA que roda no próprio navegador.
 */
export function BackingTrack({ tabId, titulo }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [busca, setBusca] = useState(titulo);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const cancelarAtual = useRef<(() => void) | null>(null);
  const tituloResultados = useRef<HTMLHeadingElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);
  const marco = useRef(-1);

  useEffect(() => {
    let vivo = true;
    lerBacking(tabId)
      .then((b) => vivo && setEstado(b ? { fase: "pronto", faixas: b.faixas, origem: b.origem, nova: false } : { fase: "vazio" }))
      .catch(() => vivo && setEstado({ fase: "vazio" }));
    return () => {
      vivo = false;
      cancelarAtual.current?.();
    };
  }, [tabId]);

  function anunciar(texto: string) {
    setAnuncio("");
    setTimeout(() => setAnuncio(texto), 30);
  }

  function falhar(mensagem: string) {
    cancelarAtual.current = null;
    setEstado({ fase: "vazio" });
    setErro(mensagem);
    setTimeout(() => campoBusca.current?.focus(), 0);
  }

  function cancelado() {
    cancelarAtual.current = null;
    setEstado({ fase: "vazio" });
    anunciar("Cancelado");
    setTimeout(() => campoBusca.current?.focus(), 0);
  }

  const foiCancelado = (e: unknown) => (e as Error)?.name === "AbortError";

  function podeCancelar(): AbortSignal {
    const c = new AbortController();
    cancelarAtual.current = () => c.abort();
    return c.signal;
  }

  async function buscar(e: Event) {
    e.preventDefault();
    setErro(null);
    setVideos(null);
    setEstado({ fase: "trabalhando", texto: "Buscando no YouTube", progresso: null });
    try {
      const r = await fetch(`/api/youtube/busca?q=${encodeURIComponent(busca)}`, { signal: podeCancelar() });
      const dados = (await r.json()) as { erro?: string; videos?: Video[] };
      if (!r.ok || !dados.videos) return falhar(dados.erro ?? "A busca falhou.");
      cancelarAtual.current = null;
      setEstado({ fase: "vazio" });
      setVideos(dados.videos);
      setTimeout(() => tituloResultados.current?.focus(), 0);
    } catch (e) {
      if (foiCancelado(e)) cancelado();
      else falhar("Não consegui falar com o servidor do app.");
    }
  }

  async function escolher(v: Video) {
    setErro(null);
    setEstado({ fase: "trabalhando", texto: `Baixando o áudio de ${v.titulo}`, progresso: null });
    setTimeout(() => botaoCancelar.current?.focus(), 0);
    try {
      const r = await fetch(`/api/youtube/audio?id=${encodeURIComponent(v.id)}`, { signal: podeCancelar() });
      if (!r.ok) {
        const dados = (await r.json().catch(() => null)) as { erro?: string } | null;
        return falhar(dados?.erro ?? "O download falhou.");
      }
      const dados = await r.arrayBuffer();
      await processar(dados, { tipo: "youtube", id: v.id, titulo: v.titulo });
    } catch (e) {
      if (foiCancelado(e)) cancelado();
      else falhar("Não consegui falar com o servidor do app.");
    }
  }

  async function abrirArquivo(e: Event) {
    const input = e.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = "";
    if (!arquivo) return;
    setErro(null);
    setEstado({ fase: "trabalhando", texto: `Abrindo ${arquivo.name}`, progresso: null });
    setTimeout(() => botaoCancelar.current?.focus(), 0);
    await processar(await arquivo.arrayBuffer(), { tipo: "arquivo", nome: arquivo.name });
  }

  function aoAvisar(m: MensagemDoTrabalhador) {
    if (m.tipo === "modelo") {
      const p = m.total ? m.recebido / m.total : null;
      const texto = "Baixando a IA que separa o baixo. Isso só acontece na primeira vez";
      setEstado({ fase: "trabalhando", texto, progresso: p });
      if (marco.current === -1) anunciar(texto);
      marco.current = 0;
    } else if (m.tipo === "preparando") {
      setEstado({ fase: "trabalhando", texto: "Preparando a IA", progresso: null });
    } else if (m.tipo === "separando") {
      const p = m.feitos / m.total;
      const falta = m.feitos > 0 ? `, falta ${falarFalta((m.segundos / m.feitos) * (m.total - m.feitos))}` : "";
      const texto = `Separando o baixo${m.placa ? "" : ", sem placa de vídeo, mais devagar"}${falta}`;
      setEstado({ fase: "trabalhando", texto, progresso: p });
      // Fala só no começo e a cada quarto, para não interromper o NVDA toda hora.
      const quarto = Math.floor(p * 4);
      if (m.feitos === 0 || (quarto > marco.current && quarto < 4)) {
        marco.current = quarto;
        anunciar(m.feitos === 0 ? "Separando o baixo" : `${quarto * 25} por cento${falta}`);
      }
    }
  }

  async function processar(dados: ArrayBuffer, origem: Origem) {
    let musica;
    try {
      musica = await decodificar(dados);
    } catch {
      return falhar("Não consegui abrir esse áudio. Tente um arquivo MP3, M4A, WAV ou OGG.");
    }
    marco.current = -1;
    const s: Separacao = separar(musica, aoAvisar);
    cancelarAtual.current = s.cancelar;
    try {
      const faixas = await s.resultado;
      cancelarAtual.current = null;
      setEstado({ fase: "pronto", faixas, origem, nova: true });
      anunciar("Backing track pronta");
      salvarBacking(tabId, { faixas, origem }).catch(() => anunciar("Não deu para guardar a backing track no navegador. Ela some ao fechar a tab."));
    } catch (e) {
      if (foiCancelado(e)) cancelado();
      else falhar((e as Error).message);
    }
  }

  async function trocar() {
    await apagarBacking(tabId).catch(() => undefined);
    setVideos(null);
    setEstado({ fase: "vazio" });
    setTimeout(() => campoBusca.current?.focus(), 0);
  }

  return (
    <section data-backing aria-labelledby="titulo-backing" class="backing">
      <h2 id="titulo-backing" tabIndex={-1}>
        Backing track
      </h2>

      {estado.fase === "vazio" && (
        <>
          <p>
            A música sem o baixo, para tocar junto. Aviso: baixar áudio do YouTube vai contra os termos de uso do site, e a música tem
            direitos autorais. Use só para estudo pessoal. Tudo fica no seu computador.
          </p>
          {erro && (
            <p class="erro" role="alert">
              {erro}
            </p>
          )}
          <form onSubmit={buscar}>
            <label for="busca-youtube">Buscar a música no YouTube</label>
            <input
              id="busca-youtube"
              ref={campoBusca}
              type="search"
              value={busca}
              onInput={(e) => setBusca((e.target as HTMLInputElement).value)}
            />{" "}
            <button type="submit">Buscar</button>
          </form>
          {videos && (
            <>
              <h3 tabIndex={-1} ref={tituloResultados}>
                {videos.length === 0 ? "Nenhum vídeo encontrado" : videos.length === 1 ? "1 vídeo encontrado" : `${videos.length} vídeos encontrados`}
              </h3>
              <ul>
                {videos.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => void escolher(v)}>
                      {v.titulo}
                      {v.canal && `, ${v.canal}`}
                      {v.duracao !== null && `, ${falarTempo(v.duracao)}`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <label for="arquivo-audio">Ou abrir um arquivo de áudio</label>
          <input id="arquivo-audio" type="file" accept="audio/*,video/mp4,video/webm" onChange={abrirArquivo} />
        </>
      )}

      {estado.fase === "trabalhando" && (
        <>
          <p>{estado.texto}</p>
          {estado.progresso !== null && (
            <progress aria-label="Progresso" max={100} value={Math.round(estado.progresso * 100)}>
              {Math.round(estado.progresso * 100)} por cento
            </progress>
          )}{" "}
          <button type="button" ref={botaoCancelar} onClick={() => cancelarAtual.current?.()}>
            Cancelar
          </button>
        </>
      )}

      {estado.fase === "pronto" && <Tocador faixas={estado.faixas} origem={estado.origem} titulo={titulo} focar={estado.nova} onTrocar={trocar} />}

      <div class="leitor" aria-live="polite">
        {anuncio}
      </div>
    </section>
  );
}

const VELOCIDADES = [50, 60, 70, 75, 80, 85, 90, 95, 100];

interface PropsTocador {
  faixas: Separado;
  origem: Origem;
  titulo: string;
  /** Leva o foco ao botão Tocar, quando a backing track acabou de ficar pronta. */
  focar: boolean;
  onTrocar: () => void;
}

function Tocador({ faixas, origem, titulo, focar, onTrocar }: PropsTocador) {
  const audio = useRef<HTMLAudioElement>(null);
  const botaoTocar = useRef<HTMLButtonElement>(null);
  const [volumeBaixo, setVolumeBaixo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(faixas.semBaixo.esquerdo.length / 44_100);
  const [velocidade, setVelocidade] = useState(100);
  const [inicio, setInicio] = useState<number | null>(null);
  const [fim, setFim] = useState<number | null>(null);
  const [repetir, setRepetir] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const posicaoEmFoco = useRef(false);

  // O WAV é refeito quando o volume do baixo muda; a posição e o play continuam.
  const [volumeAplicado, setVolumeAplicado] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setVolumeAplicado(volumeBaixo), 300);
    return () => clearTimeout(t);
  }, [volumeBaixo]);
  const url = useMemo(() => URL.createObjectURL(mixarWav(faixas, volumeAplicado / 100)), [faixas, volumeAplicado]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onde = a.currentTime;
    const continuar = !a.paused;
    a.src = url;
    a.addEventListener(
      "loadedmetadata",
      () => {
        a.currentTime = onde;
        a.playbackRate = velocidade / 100;
        if (continuar) void a.play();
      },
      { once: true },
    );
  }, [url]);

  useEffect(() => {
    if (focar) botaoTocar.current?.focus();
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade / 100;
  }, [velocidade]);

  function anunciar(texto: string) {
    setAnuncio("");
    setTimeout(() => setAnuncio(texto), 30);
  }

  function aoAndar() {
    const a = audio.current!;
    if (repetir && fim !== null && a.currentTime >= fim) a.currentTime = inicio ?? 0;
    if (!posicaoEmFoco.current) setPosicao(a.currentTime);
  }

  function alternar() {
    const a = audio.current!;
    if (a.paused) {
      if (repetir && fim !== null && a.currentTime >= fim) a.currentTime = inicio ?? 0;
      void a.play();
    } else a.pause();
  }

  function pular(segundos: number) {
    const a = audio.current!;
    a.currentTime = Math.max(0, Math.min(duracao, a.currentTime + segundos));
    setPosicao(a.currentTime);
    anunciar(falarTempo(a.currentTime));
  }

  function marcar(qual: "inicio" | "fim") {
    const t = audio.current!.currentTime;
    if (qual === "inicio") {
      setInicio(t);
      if (fim !== null && fim <= t) setFim(null);
      anunciar(`Início do trecho em ${falarTempo(t)}`);
    } else {
      if (inicio !== null && t <= inicio) return anunciar("O fim do trecho precisa vir depois do início");
      setFim(t);
      setRepetir(true);
      anunciar(`Fim do trecho em ${falarTempo(t)}. Repetindo o trecho`);
    }
  }

  const nomeArquivo = `${titulo} - ${volumeAplicado === 0 ? "sem baixo" : `baixo em ${volumeAplicado} por cento`}.wav`;
  const textoOrigem = origem.tipo === "youtube" ? `Áudio do YouTube: ${origem.titulo}.` : `Áudio do arquivo ${origem.nome}.`;

  return (
    <>
      <p>{textoOrigem}</p>
      <audio
        ref={audio}
        preload="auto"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
        onTimeUpdate={aoAndar}
        onLoadedMetadata={() => setDuracao(audio.current!.duration)}
      />
      <div class="opcoes">
        <button type="button" ref={botaoTocar} onClick={alternar}>
          {tocando ? "Pausar" : "Tocar backing track"}
        </button>
        <button type="button" onClick={() => pular(-5)}>
          Voltar 5 segundos
        </button>
        <button type="button" onClick={() => pular(5)}>
          Avançar 5 segundos
        </button>
      </div>
      <div class="opcoes">
        <label>
          Posição{" "}
          <input
            type="range"
            min={0}
            max={Math.floor(duracao)}
            step={1}
            value={Math.floor(posicao)}
            aria-valuetext={`${falarTempo(posicao)} de ${falarTempo(duracao)}`}
            onFocus={() => (posicaoEmFoco.current = true)}
            onBlur={() => (posicaoEmFoco.current = false)}
            onInput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              setPosicao(v);
              audio.current!.currentTime = v;
            }}
          />
        </label>
        <label>
          Velocidade{" "}
          <select value={velocidade} onChange={(e) => setVelocidade(Number((e.target as HTMLSelectElement).value))}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {v} por cento
              </option>
            ))}
          </select>
        </label>
        <label>
          Volume do baixo original{" "}
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={volumeBaixo}
            aria-valuetext={volumeBaixo === 0 ? "0 por cento, sem baixo" : `${volumeBaixo} por cento`}
            onInput={(e) => setVolumeBaixo(Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
      <div class="opcoes">
        <button type="button" onClick={() => marcar("inicio")}>
          Marcar início do trecho
        </button>
        <button type="button" onClick={() => marcar("fim")}>
          Marcar fim do trecho
        </button>
        <label>
          <input type="checkbox" checked={repetir} disabled={fim === null} onChange={(e) => setRepetir((e.target as HTMLInputElement).checked)} />{" "}
          Repetir trecho
        </label>
      </div>
      <p>
        <a href={url} download={nomeArquivo}>
          Salvar a backing track em arquivo
        </a>{" "}
        <button type="button" onClick={onTrocar}>
          Trocar o áudio
        </button>
      </p>
      <div class="leitor" aria-live="polite">
        {anuncio}
      </div>
    </>
  );
}
