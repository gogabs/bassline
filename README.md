# Bassline

Bassline transforma tablaturas de baixo em um formato acessível para baixistas cegos. O foco é o leitor de tela NVDA.

A ideia é ler uma tab em texto, como as do Cifra Club e do Ultimate Guitar, e apresentar as notas em ordem, compasso por compasso, em texto e em áudio.

## Como rodar

Precisa de Node 20 ou mais novo.

1. `npm install`
2. `npm test` roda os testes do parser.
3. `npm run typecheck` confere os tipos.
4. `npm run parse -- caminho/da/tab.txt` lê uma tab em texto e mostra o resultado em JSON.
5. `npm run inicio` constrói o app e abre em http://localhost:8787, já com a busca por link.
6. Para desenvolver a interface, rode `npm run servidor` e, em outro terminal, `npm run dev`.
7. `npm run test:e2e` testa o teclado e a acessibilidade no Chrome. Rode `npm run build` antes.
8. `npm run test:backing` testa a backing track no Chrome, com a IA de verdade. Rode `npm run build` antes. Na primeira vez baixa o modelo, uns 180 MB.

## Parser

O parser fica em `src/parser`. A entrada é a função `parseTab(texto)`, exportada por `src/parser/index.ts`. Ela devolve só dados estruturados, e os tipos estão em `src/parser/types.ts`. Transformar esses dados em frases é trabalho do narrador, na interface.

O parser já entende:

- Baixo de 4, 5 e 6 cordas, afinações nomeadas nas linhas da tab ou numa linha "Afinação:" no topo.
- Compassos separados por barras, seções com rótulo (como `[Intro]` ou `Refrão:`) e repetições (`x4`, `(x2)`, `|: ... :|`).
- Casas de um e dois dígitos e notas tocadas juntas.
- Hammer-on (h), pull-off (p), slide (/, \ e s, inclusive slide de entrada e de saída), bend (b) e release (r) com alvo, vibrato (~), ghost note ((5)), nota morta (x), harmônico natural (<12>, [12], 12*) e artificial (AH, PH), slap (T, S), pop (P), tapping (t) e palm mute (PM na linha de anotação).
- A legenda da tab, quando ela diz que P maiúsculo é pull-off.

Qualquer símbolo que o parser não entende vai para `unknownSymbols`, com o compasso, a corda e a posição, para o app avisar em vez de ignorar.

## Narrador

O narrador transforma os dados do parser em frases. Ele fica em `src/narrador` e não depende da interface. O contrato é a interface `Narrador`, em `src/narrador/tipos.ts`: uma função `narrar(song, opções)` que devolve o resumo, os avisos e as seções, com os compassos e o texto de cada símbolo. O narrador padrão, em português, está em `src/narrador/portugues.ts`. Para criar outro, implemente `Narrador` e chame `registrarNarrador`.

## Interface

A interface fica em `src/app`, feita com Preact. Leitura e prática são a mesma tela. Seções são títulos de nível 2, compassos são títulos de nível 3, compassos iguais seguidos viram um só, e cada compasso tem um botão para tocar.

No modo de foco do NVDA:

- Baixo e Cima vão para o próximo e o anterior compasso. Se a seção mudar, o app fala a seção junto.
- Ctrl mais Baixo e Ctrl mais Cima vão para a próxima e a anterior seção.
- Direita e Esquerda andam pelos símbolos do compasso.
- Enter toca o compasso, e Escape para o som.

## Busca por link

O navegador não pode ler páginas de outros sites, então o mini servidor em `server/index.ts` busca a página e devolve a tab. Cada site é uma fonte em `src/fontes`, com os domínios aceitos e uma função que tira a tab do HTML. Hoje existem fontes para o Cifra Club e o Ultimate Guitar. Para aceitar outro site, escreva uma fonte e chame `registrarFonte`.

## Backing track

Na tela da tab, a seção Backing track gera a música sem o baixo, para tocar junto.

1. O áudio vem do YouTube ou de um arquivo. A busca usa o título da tab e mostra os 5 primeiros vídeos, e quem baixa o áudio é o yt-dlp, no mini servidor. O navegador não consegue fazer isso sozinho, porque o YouTube não deixa outras páginas lerem os vídeos. Se o yt-dlp não estiver instalado, o servidor baixa uma cópia na primeira vez e guarda em `~/.bassline`. Se um download falhar, ele tenta atualizar o yt-dlp uma vez. A variável `YTDLP` aponta para outro yt-dlp, e `BASSLINE_DADOS` troca a pasta.
2. O baixo é separado no navegador pelo HTDemucs, no formato do projeto [demucs-web](https://github.com/timcsy/demucs-web) (licença MIT), com o ONNX Runtime Web. Usa a placa de vídeo pelo WebGPU quando o Chrome deixa, e o processador quando não. O modelo tem uns 180 MB: o servidor baixa do Hugging Face na primeira vez, e o navegador guarda uma cópia.
3. A música sem o baixo é o original menos o baixo separado, para nada além do baixo mudar. As faixas ficam guardadas no navegador, por tab.
4. O tocador tem tocar e pausar, voltar e avançar 5 segundos, posição, velocidade sem mudar o tom, volume do baixo original, trecho para repetir e um link para salvar em WAV.

O código fica em `src/backing` (separação, trechos, WAV e armazenamento), `src/app/BackingTrack.tsx` (tela) e `server/backing.ts` (yt-dlp e modelo).

Aviso: baixar áudio do YouTube vai contra os termos de uso do site, e as músicas têm direitos autorais. O app mostra esse aviso e deixa tudo no computador de quem usa. Não ofereça a busca no YouTube num servidor público.
