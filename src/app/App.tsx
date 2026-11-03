import { useEffect, useMemo, useState } from "preact/hooks";
import { parseTab } from "../parser";
import { obterTab } from "./armazenamento";
import { Configuracoes } from "./Configuracoes";
import { Inicio } from "./Inicio";
import { carregarPreferencias, salvarPreferencias, type Preferencias } from "./preferencias";
import { TabView } from "./TabView";

type Rota = { tela: "inicio" } | { tela: "tab"; id: string } | { tela: "config" };

function lerRota(): Rota {
  const h = location.hash;
  if (h.startsWith("#/tab/")) return { tela: "tab", id: h.slice(6) };
  if (h === "#/config") return { tela: "config" };
  return { tela: "inicio" };
}

export function App() {
  const [rota, setRota] = useState<Rota>(lerRota);
  const [prefs, setPrefsEstado] = useState<Preferencias>(carregarPreferencias);

  const setPrefs = (p: Preferencias) => {
    setPrefsEstado(p);
    salvarPreferencias(p);
  };

  useEffect(() => {
    const mudou = () => {
      // Só links que começam com #/ são telas; os outros são âncoras dentro da página.
      if (location.hash === "" || location.hash.startsWith("#/")) setRota(lerRota());
    };
    window.addEventListener("hashchange", mudou);
    return () => window.removeEventListener("hashchange", mudou);
  }, []);

  // Ao abrir uma tela nova, o foco vai para o título dela.
  const chaveRota = JSON.stringify(rota);
  const [primeira, setPrimeira] = useState(true);
  useEffect(() => {
    if (primeira) return setPrimeira(false);
    document.getElementById("titulo-pagina")?.focus();
  }, [chaveRota]);

  return (
    <main>
      <nav>
        <ul>
          <li>
            <a href="#/">Início</a>
          </li>
          <li>
            <a href="#/config">Configurações</a>
          </li>
        </ul>
      </nav>
      {rota.tela === "inicio" && <Inicio prefs={prefs} />}
      {rota.tela === "config" && <Configuracoes prefs={prefs} onPrefs={setPrefs} />}
      {rota.tela === "tab" && <TelaTab id={rota.id} prefs={prefs} onPrefs={setPrefs} />}
    </main>
  );
}

function TelaTab({ id, prefs, onPrefs }: { id: string; prefs: Preferencias; onPrefs: (p: Preferencias) => void }) {
  const tab = useMemo(() => obterTab(id), [id]);
  const song = useMemo(() => (tab ? parseTab(tab.texto, { capitalP: prefs.pMaiusculo }) : null), [tab, prefs.pMaiusculo]);
  useEffect(() => {
    document.title = tab ? `${tab.titulo} - Bassline` : "Bassline";
  }, [tab]);
  if (!tab || !song)
    return (
      <>
        <h1 tabIndex={-1} id="titulo-pagina">
          Tab não encontrada
        </h1>
        <p>
          <a href="#/">Voltar ao início</a>
        </p>
      </>
    );
  return <TabView titulo={tab.titulo} fonteUrl={tab.fonteUrl} song={song} prefs={prefs} onPrefs={onPrefs} />;
}
