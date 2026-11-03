import { useRef, useState } from "preact/hooks";
import { parseTab } from "../parser";
import { pareceLink } from "../fontes";
import { semInvisiveis } from "../fontes/html";
import { apagarTab, listarTabs, salvarTab } from "./armazenamento";
import type { Preferencias } from "./preferencias";

export function Inicio({ prefs }: { prefs: Preferencias }) {
  const [entrada, setEntrada] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tabs, setTabs] = useState(listarTabs);
  const campo = useRef<HTMLTextAreaElement>(null);

  function falhar(mensagem: string) {
    setErro(mensagem);
    setOcupado(false);
    campo.current?.focus();
  }

  async function converter(e: Event) {
    e.preventDefault();
    setErro(null);
    let texto = entrada;
    let titulo = nome.trim();
    let fonteUrl: string | null = null;
    if (!texto.trim()) return falhar("Cole um link ou o texto de uma tab.");

    if (pareceLink(texto)) {
      setOcupado(true);
      try {
        const r = await fetch(`/api/tab?url=${encodeURIComponent(texto.trim())}`);
        const dados = (await r.json()) as { erro?: string; texto?: string; titulo?: string | null; url?: string };
        if (!r.ok || !dados.texto) return falhar(dados.erro ?? "Não consegui buscar a tab. Você pode colar o texto dela.");
        texto = dados.texto;
        titulo ||= dados.titulo ?? "";
        fonteUrl = dados.url ?? texto.trim();
      } catch {
        return falhar("Não consegui falar com o servidor do app. Você pode colar o texto da tab.");
      }
    }

    // Texto copiado de sites pode trazer caracteres invisíveis no começo das linhas.
    texto = semInvisiveis(texto);
    const song = parseTab(texto, { capitalP: prefs.pMaiusculo });
    const compassos = song.sections.reduce((n, s) => n + s.measures.length, 0);
    if (compassos === 0) return falhar("Não encontrei as linhas das cordas na tab, como as que começam com G, D, A e E.");

    const tab = salvarTab({ titulo: titulo || "Tab sem nome", texto, fonteUrl });
    location.hash = `#/tab/${tab.id}`;
  }

  async function abrirArquivo(e: Event) {
    const arquivo = (e.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    setEntrada(await arquivo.text());
    if (!nome) setNome(arquivo.name.replace(/\.[^.]+$/, ""));
    campo.current?.focus();
  }

  return (
    <>
      <h1 tabIndex={-1} id="titulo-pagina">
        Bassline
      </h1>
      <form onSubmit={converter}>
        <label for="entrada">Link ou texto da tab</label>
        <textarea
          id="entrada"
          ref={campo}
          value={entrada}
          onInput={(e) => setEntrada((e.target as HTMLTextAreaElement).value)}
          aria-describedby={erro ? "erro" : undefined}
          aria-invalid={erro ? true : undefined}
        />
        {erro && (
          <p id="erro" class="erro" role="alert">
            {erro}
          </p>
        )}
        <label for="nome">Nome da música, opcional</label>
        <input id="nome" type="text" value={nome} onInput={(e) => setNome((e.target as HTMLInputElement).value)} />
        <label for="arquivo">Abrir arquivo de texto</label>
        <input id="arquivo" type="file" accept=".txt,text/plain" onChange={abrirArquivo} />
        <p>
          <button type="submit" disabled={ocupado}>
            {ocupado ? "Buscando a tab" : "Converter"}
          </button>
        </p>
      </form>

      <h2>Minhas tabs</h2>
      {tabs.length === 0 ? (
        <p>Nenhuma tab ainda.</p>
      ) : (
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <a href={`#/tab/${t.id}`}>{t.titulo}</a>{" "}
              <button
                type="button"
                onClick={() => {
                  apagarTab(t.id);
                  setTabs(listarTabs());
                }}
              >
                Apagar {t.titulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
