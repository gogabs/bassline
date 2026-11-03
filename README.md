# Bassline

Bassline transforma tablaturas de baixo em um formato acessível para baixistas cegos. O foco é o leitor de tela NVDA.

A ideia é ler uma tab em texto, como as do Cifra Club e do Ultimate Guitar, e apresentar as notas em ordem, compasso por compasso, em texto e em áudio.

## Como rodar

Precisa de Node 20 ou mais novo.

1. `npm install`
2. `npm test` roda os testes do parser.
3. `npm run typecheck` confere os tipos.
4. `npm run parse -- caminho/da/tab.txt` lê uma tab em texto e mostra o resultado em JSON.

## Parser

O parser fica em `src/parser`. A entrada é a função `parseTab(texto)`, exportada por `src/parser/index.ts`. Ela devolve só dados estruturados, e os tipos estão em `src/parser/types.ts`. Transformar esses dados em frases é trabalho do narrador, na interface.

O parser já entende:

- Baixo de 4, 5 e 6 cordas, afinações nomeadas nas linhas da tab ou numa linha "Afinação:" no topo.
- Compassos separados por barras, seções com rótulo (como `[Intro]` ou `Refrão:`) e repetições (`x4`, `(x2)`, `|: ... :|`).
- Casas de um e dois dígitos e notas tocadas juntas.
- Hammer-on (h), pull-off (p), slide (/, \ e s, inclusive slide de entrada e de saída), bend (b) e release (r) com alvo, vibrato (~), ghost note ((5)), nota morta (x), harmônico natural (<12>, [12], 12*) e artificial (AH, PH), slap (T, S), pop (P), tapping (t) e palm mute (PM na linha de anotação).
- A legenda da tab, quando ela diz que P maiúsculo é pull-off.
- Números grudados, como "2222" (quatro notas na casa 2) e "24" (casa 2 e depois 4). Casas de 16 a 24 só são lidas como uma casa quando a música usa casas de 10 a 15 em outro lugar. Quando o parser separa números, ele avisa em `warnings`.
- Caracteres invisíveis que alguns sites colocam no texto, como o espaço de largura zero.

Quando a tab não tem barras de compasso dentro da linha, cada linha vira um compasso só, porque não há como saber onde o compasso termina.

Qualquer símbolo que o parser não entende vai para `unknownSymbols`, com o compasso, a corda e a posição, para o app avisar em vez de ignorar.
