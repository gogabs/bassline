import type { JSX } from "preact";
import { listarNarradores } from "../narrador";
import type { Preferencias } from "./preferencias";

interface Opcao<T extends string> {
  valor: T;
  texto: string;
}

export function Configuracoes({ prefs, onPrefs }: { prefs: Preferencias; onPrefs: (p: Preferencias) => void }) {
  function grupo<K extends keyof Preferencias>(chave: K, legenda: string, opcoes: Opcao<Extract<Preferencias[K], string>>[]): JSX.Element {
    return (
      <fieldset>
        <legend>{legenda}</legend>
        {opcoes.map((o) => (
          <label key={o.valor}>
            <input
              type="radio"
              name={chave}
              checked={prefs[chave] === o.valor}
              onChange={() => onPrefs({ ...prefs, [chave]: o.valor })}
            />{" "}
            {o.texto}
          </label>
        ))}
      </fieldset>
    );
  }

  const narradores = listarNarradores();

  return (
    <>
      <h1 tabIndex={-1} id="titulo-pagina">
        Configurações
      </h1>
      <p>As mudanças valem na hora e ficam guardadas neste navegador.</p>

      {grupo("leitura", "Leitura da nota", [
        { valor: "posicao", texto: "Corda e casa" },
        { valor: "nome", texto: "Nome da nota" },
        { valor: "ambos", texto: "Os dois" },
      ])}
      {grupo("nomes", "Nomes das notas", [
        { valor: "pt", texto: "Dó, Ré, Mi" },
        { valor: "en", texto: "C, D, E" },
      ])}
      {grupo("acidentes", "Acidentes", [
        { valor: "sustenido", texto: "Sustenido" },
        { valor: "bemol", texto: "Bemol" },
      ])}
      {grupo("tecnicas", "Falar as técnicas", [
        { valor: "sempre", texto: "Sempre" },
        { valor: "primeira", texto: "Só na primeira vez em cada compasso" },
        { valor: "nunca", texto: "Nunca" },
      ])}
      {grupo("pMaiusculo", "P maiúsculo na tab", [
        { valor: "pop", texto: "Pop" },
        { valor: "pull-off", texto: "Pull-off" },
      ])}
      {grupo("timbre", "Timbre do som", [
        { valor: "redondo", texto: "Redondo" },
        { valor: "brilhante", texto: "Brilhante" },
      ])}

      <fieldset>
        <legend>Repetições</legend>
        <label>
          <input type="checkbox" checked={prefs.juntarRepetidas} onChange={(e) => onPrefs({ ...prefs, juntarRepetidas: (e.target as HTMLInputElement).checked })} />{" "}
          Juntar notas iguais seguidas
        </label>
        <label>
          <input type="checkbox" checked={prefs.juntarCompassos} onChange={(e) => onPrefs({ ...prefs, juntarCompassos: (e.target as HTMLInputElement).checked })} />{" "}
          Juntar compassos iguais seguidos
        </label>
      </fieldset>

      <fieldset>
        <legend>Som</legend>
        <label>
          Andamento, em batidas por minuto{" "}
          <input type="number" min={30} max={240} step={5} value={prefs.bpm} onChange={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (v >= 30 && v <= 240) onPrefs({ ...prefs, bpm: v });
          }} />
        </label>
        <label>
          Volume{" "}
          <input type="range" min={0} max={100} step={5} value={prefs.volume} onInput={(e) => onPrefs({ ...prefs, volume: Number((e.target as HTMLInputElement).value) })} />
        </label>
      </fieldset>

      {narradores.length > 1 && (
        <label>
          Narrador{" "}
          <select value={prefs.narrador} onChange={(e) => onPrefs({ ...prefs, narrador: (e.target as HTMLSelectElement).value })}>
            {narradores.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
