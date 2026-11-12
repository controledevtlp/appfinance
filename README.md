# Finanças Claras

App de controle financeiro para **Android e iOS** (Expo / React Native + TypeScript) com painel, orçamento ideal,
dicas de economia e importação de extrato. Dados na nuvem via **Supabase** (ou só no aparelho, em modo local).

## O que tem

| Tela | O que faz |
|---|---|
| **Painel** | Quanto sobrou no mês, **ritmo de gasto do mês** (acumulado × ritmo ideal), nota de saúde financeira (0–100, explicada), regra 50/30/20, para onde vai o dinheiro, últimos 6 meses, gastos constantes, reserva de emergência e principais dicas |
| **Lançamentos** | Lista por dia com busca e filtro; adicionar/editar/excluir; **grade visual de categorias** com ícone; categoria sugerida pelo nome; apelido para gastos |
| **Detalhe** | Toque em qualquer número e veja exatamente os lançamentos que o formaram, com composição por categoria |
| **Orçamento** | Limite ideal por categoria (calculado sobre a sua renda), barras de uso, limites personalizáveis |
| **Investir** | Simulador de renda fixa: quanto você vai ter, ou quanto precisa guardar por mês; comparação de Tesouro Selic, CDB, LCI/LCA e poupança **pelo líquido** |
| **Dicas** | *Onde economizar*: alertas por gravidade, cada um com **plano em etapas** e economia estimada. *Onde fazer render*: **renda fixa**, na ordem reserva → prazo |
| **Importar extrato** | CSV, OFX e **PDF**, com prévia, correção de categoria (e de entrada/saída), descarte de duplicados e **mapeamento de gastos constantes** |
| **Minha renda** | Informe quanto recebe sem precisar de extrato: várias fontes (salário, freela, aluguel…), **cartão alimentação**, total ao vivo e prévia do 50/30/20 enquanto digita |
| **Ajustes** | Renda líquida, reserva atual, notificações, dados de exemplo, conta |

### Como os cálculos funcionam (`src/engine`)
- **Cartão alimentação**: é renda de uso restrito, então não entra na renda livre (a regra 50/30/20 continua saindo do salário) — ele eleva o teto de mercado e alimentação fora, rateado pelos ideais dessas duas categorias, e conta no quanto sobrou no mês.
- **Financiamento de carro/moto** tem categoria própria (3% da renda como referência), conta como custo fixo no plano de melhoria e entra no comprometimento da renda junto com as outras dívidas. O categorizador reconhece "financiamento do carro", consórcio e as financeiras mais comuns (Banco Honda, BV, Aymoré, Losango, entre outras).
- **Regra 50/30/20** sobre a renda líquida: 50% necessidades, 30% desejos, 20% poupança. Cada categoria tem um % ideal (ver `categories.ts`) e você pode sobrescrever o limite.
- **Taxa de poupança** = (renda − gastos de necessidades e desejos) ÷ renda. Meta: 20%.
- **Reserva de emergência**: meta = 6 × custo médio mensal de necessidades, calculado só com **meses completos** (o mês em andamento ficaria baixo porque as contas ainda não venceram). Sem histórico, estima por 50% da renda.
- **Nota de saúde** (100 pts): poupança 40 · dívidas 20 · categorias no limite 25 · reserva 15.
- **Plano de redução**: para gasto variável (mercado, delivery, lazer, compras…) o corte é dividido em 3 meses (⅓, ⅔, total). Para **custo fixo** (moradia, contas, saúde, educação, dívidas) não faz sentido "cortar um terço em 30 dias", então o plano é renegociar — ver `FIXED_COST_CATEGORIES`.
- **Projeção do mês**: custo fixo entra uma vez só (o que já venceu, ou o total do mês passado se ainda falta vencer) e só o gasto variável segue o ritmo diário. Extrapolar tudo por dia contaria o aluguel várias vezes.
- **Comparação com o mês anterior**: compara o mesmo pedaço do mês (dia 1 até hoje), não o mês inteiro rateado — assim uma assinatura cobrada todo dia 5 não vira "aumento" no dia 12.
- No mês em andamento a nota aparece como parcial e a taxa de poupança não é elogiada até o mês fechar.
- Excessos menores que R$ 20 não geram dica.
- A soma "você libera até X/mês" não conta duas vezes: juros que já estão numa categoria estourada entram uma vez só.

Todo o motor é TypeScript puro e testado: `npm test` (110 testes).

## Rodar no computador

```bash
cd financas-app
npm install
npx expo start        # escaneie o QR code com o app Expo Go
```

Sem configurar nada, o app roda em **modo local** (dados no aparelho). Na tela inicial use
“Ver com dados de exemplo” para conhecer.

## Ligar o Supabase (nuvem + login)

1. Crie um projeto em <https://supabase.com>.
2. **SQL Editor → New query**: cole o conteúdo de `supabase/schema.sql` e execute. Isso cria as tabelas e as regras de segurança (cada usuário só vê os próprios dados).
3. **Project Settings → API Keys**: copie a *Project URL* e a *Publishable key*.
4. Copie `.env.example` para `.env` e preencha:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. Reinicie `npx expo start`. O app passa a pedir login (e-mail e senha).
   Em *Authentication → Providers → Email* você pode desligar “Confirm email” para testar sem confirmar por e-mail.

> A chave publishable é pública por design; quem protege os dados é a regra de segurança (RLS) do `schema.sql`.
> Nunca coloque a chave `service_role` no app.

## Gerar o app instalável

**Android (APK, grátis):**
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview     # gera um .apk para baixar e instalar
```
Defina as variáveis do Supabase no build (`eas env:create` ou no painel da Expo), porque o `.env` local não vai para o build na nuvem.

**iOS:** instalar no iPhone fora da App Store exige conta Apple Developer (US$ 99/ano) — `eas build -p ios --profile preview`.
Sem a conta, dá para usar o app no iPhone pelo **Expo Go**.

## Notificações
São **locais** (agendadas no próprio aparelho, sem servidor): alerta quando uma categoria chega a 80% e quando estoura o limite, resumo semanal (domingo 19h) e lembrete diário opcional (20h30). A permissão é pedida na primeira vez. Funcionam tanto no APK quanto no Expo Go — o Expo Go só não suporta notificações *push* (remotas), que este app não usa.

## Gastos constantes
Ao ler o extrato, o app agrupa os lançamentos por descrição (ignorando números, então "Parcela 3/10" e "Parcela 4/10" são o mesmo compromisso) e já marca os que parecem fixos: os que repetem em 2+ meses com valor praticamente igual, ou os de categoria tipicamente fixa (moradia, contas, assinaturas, dívidas, educação). Um delivery que repete com valores diferentes **não** é marcado. Você confirma ou desmarca cada um, e o total aparece na hora comparado com 50% da sua renda. O que é marcado entra na projeção do mês como conta que vence uma vez só.

## Ver os detalhes de qualquer número (drill down)
Os valores do painel e do orçamento são tocáveis e abrem a tela de detalhe com **o mesmo filtro usado no cálculo**: Receitas, Despesas, Investido, cada grupo do 50/30/20, cada fatia do gráfico, cada categoria do orçamento, os gastos constantes e o cartão alimentação. A tela mostra o total, a média, a composição por categoria e a lista do maior para o menor — que é a ordem útil para achar o que pesou.

## O app aprende suas correções
Trocou a categoria de um lançamento na importação ou na tela de edição? A escolha é guardada pela chave de agrupamento da descrição (sem números), e na próxima importação aquele estabelecimento já vem na categoria certa. Vale para "SAUL E PIMENTA GASTROB" tanto quanto para "UAI LAVA BRASOPOLIS 047".

## Dar nome aos gastos
O extrato traz "ENEL DISTRIBUICAO SP 0001". No lançamento, o campo **Dê um nome** renomeia, e quando o gasto se repete aparece a opção *"usar este nome nos N lançamentos iguais"*. O apelido é guardado pela chave de agrupamento (sem números nem pontuação), então vale para as parcelas e para os próximos meses importados. O nome original do extrato continua visível na tela de edição.

## Dicas de investimento (renda fixa)
Seção separada na aba Dicas, que acompanha a situação: enquanto a reserva não está completa, fala só de onde deixar a reserva (liquidez diária); depois passa a falar de prazo (pós-fixado para o curto, IPCA+ para o longo), tabela regressiva de IR e comparação pelo líquido. Também avisa quando sobra dinheiro e nada foi investido.
É **informação geral para estudar, não recomendação** de investimento nem indicação de banco ou corretora, e cada bloco pede para conferir as regras atuais antes de investir — elas mudam.

## O jeito de falar
O app conversa como um amigo que entende de grana, não como gerente de banco: "Opa, você tá gastando mais do que ganha", "Dá pra guardar R$ 710/mês", "Tá de boa". Quando o buraco é sério, ele fala sério — sem meias palavras. Os números e as regras continuam exatos; o que mudou foi o tom. Os avisos de que isso não é recomendação de investimento continuam onde precisam estar.

## Visual (glassmorphism em verde-sálvia)
Carvão quase preto com acento **verde-sálvia**, inspirado numa referência de dashboard financeiro. O acento aparece em pontos — pílula da aba ativa, quadradinho de ícone, cartão de saldo —, não espalhado pela tela: é o que separa "elegante" de "cansativo". Os brilhos do fundo são discretos de propósito; o que dá profundidade é o degradê dos cartões.

Entrada e saída de dinheiro têm cores próprias (menta e coral), porque ali a cor precisa significar alguma coisa e não pode se confundir com o acento.

**O truque de desempenho:** desfocar cada cartão de verdade é caro, principalmente no Android. Em vez disso, o fundo já é suave — brilhos em degradê radial desenhados uma vez em SVG (`Backdrop`) — e os cartões são só uma camada translúcida com borda clara de 1px. A leitura é de vidro e o custo é de uma `View` comum. Desfoque real (`expo-blur`) fica só na barra de navegação, que é um elemento só.

Os dois temas são de vidro: escuro = branco a 5,5% sobre carvão esverdeado com acento sálvia claro; claro = branco translúcido sobre off-white esverdeado com acento verde-floresta (sálvia não tem contraste para texto em fundo claro). Tudo sai de `src/theme/index.ts`, inclusive a paleta dos gráficos.

## Simulador de investimentos (`src/engine/invest.ts`)
Matemática pura e testada: juros compostos com aporte mensal, tabela regressiva do IR (22,5% / 20% / 17,5% / 15%) e a regra da poupança (trava em 0,5% ao mês com a Selic acima de 8,5%).

Dois modos: **quanto vou ter** e **quanto preciso guardar**. O segundo mira o valor **líquido** — se mirasse o bruto, você pediria R$ 30 mil, o app daria um aporte e no fim chegariam R$ 29 mil, porque o imposto comeria a diferença.

A comparação ordena pelo que sobra depois do imposto, e é aí que está o aprendizado: **uma LCI de 90% do CDI isenta ganha de um CDB de 100% tributado**. Taxa de vitrine não diz nada sozinha.

A taxa de referência (CDI/Selic) é digitada por você e fica guardada. Não cravei um número no código de propósito: a Selic muda, e um valor fixo envelheceria mentindo. O que o app não faz: buscar a taxa sozinho (precisaria de um serviço externo) e prometer rendimento — está escrito na tela que é simulação, não recomendação.

## Cabeçalho transparente
O cabeçalho é transparente para o degradê atravessar a tela inteira — e cabeçalho transparente fica **por cima** do conteúdo. Sem folga no topo, o primeiro elemento (o seletor de mês) nasce embaixo do título. Quem calcula essa folga é `useHeaderPad()`, que pega a altura real do cabeçalho pelo navegador e só cai para um cálculo manual em tela sem cabeçalho.

Os cabeçalhos também aparecem na versão web. Ficavam escondidos lá, e foi por isso que esse problema passou: os testes de tela não mostravam o caso que existe no celular.

## Troca de abas
Três coisas faziam a troca parecer cortada:
- a transição das telas vem desligada por padrão (`animation: 'none'`) — agora é `shift` com 220ms;
- cada tela desenhava o próprio fundo, então um degradê novo entrava junto com a tela e piscava. Agora o fundo é desenhado **uma vez só** no grupo de abas (`BackdropProvider`), e as telas consultam um contexto para não empilhar outro;
- a pílula do destaque sumia de um lugar e aparecia no outro. Agora é um elemento só que desliza com mola, e a cor do ícone e do rótulo acompanha o movimento — senão o texto fica escuro sobre fundo escuro no meio do caminho.

As telas ficam montadas (`detachInactiveScreens={false}`), então os cartões não repetem a animação de entrada toda vez que você volta para a aba.

## Gráficos e animações
Barras e áreas com degradê, pontas arredondadas, valores escritos em cima das barras e hierarquia de texto (rótulo em caixa alta pequena, número grande e pesado). O valor principal do painel **conta até o número** em vez de aparecer pronto: no celular isso roda na thread de UI (`animatedProps` sobre um `TextInput`), no navegador cai para um contador simples, porque ali o Reanimated não anima texto.

Gráficos em SVG puro (`react-native-svg`), sem biblioteca de charts — são poucos elementos e o desenho é barato. As animações usam **Reanimated**, que roda na thread de UI: a rolagem não engasga enquanto o orçamento é recalculado, e nada anima quadro a quadro em JavaScript. As primitivas ficam em `src/components/motion.tsx` (entrada escalonada dos cartões, toque com resposta tátil, barras que crescem até o valor). Listas longas não recebem animação por item, de propósito. No celular, cada toque também dá um retorno tátil curto (`expo-haptics`). O Reanimated respeita "reduzir movimento" do sistema.

## Importar extrato
No app/internet banking, exporte o extrato em **CSV, OFX ou PDF** (ou a fatura do cartão) e escolha o arquivo em *Importar extrato*.
- Detecta separador (`;`/`,`), cabeçalho (mesmo com linhas de preâmbulo), valores `1.234,56`, colunas separadas de débito/crédito e acentos em Latin-1.
- Fatura de cartão (positivo = compra) é detectada, ou ligue a chave manualmente.
- Pagamento de fatura e transferências ficam em “Transferência” e **não** entram nas contas, para não contar gasto em dobro.
- Reimportar o mesmo arquivo não duplica (identificador do banco ou hash estável).
- Depois de importar, o app vai para o mês com mais lançamentos do arquivo, em vez de abrir no mês atual vazio.

### PDF
O leitor de PDF é próprio (`src/engine/import/pdf.ts`). Ele indexa os objetos do arquivo (`12 0 obj … endobj`) em vez de caçar a palavra `stream` solta — que também aparece dentro de fontes e imagens e faria o leitor inflar lixo —, descomprime FlateDecode (via `fflate`), lê os operadores de texto (`Tj`, `TJ`, `Td`, `Tm`, `Tf`) e remonta as linhas **guardando a posição de cada célula na página**.

**Fontes embutidas (Identity-H).** É assim que os bancos geram PDF hoje: o texto não são letras, são índices de glifo de 2 bytes, e cada fonte numera os seus. Lido como ASCII, "Lucas" vira "/XFDV". O leitor resolve o `/Resources → /Font` de cada página, lê o CMap `/ToUnicode` de cada fonte (`bfchar` e `bfrange`) e traduz conforme a fonte ativa no momento.

Com isso ele entende as variações reais dos bancos:

| O que varia | Como é tratado |
|---|---|
| `10/10/2026`, `10/10/26`, `10/10` | ano completado pelo ano predominante no documento |
| `03 OUT`, `05 out`, `10 de outubro` | mês por extenso ou abreviado, em maiúsculas ou minúsculas |
| data só no cabeçalho do dia (Nubank) | a data do cabeçalho vale para as linhas abaixo |
| colunas separadas de Crédito e Débito (Bradesco) | o sinal vem da posição da célula na página |
| sufixo `D`/`C` (Banco do Brasil) | débito e crédito |
| coluna de saldo no fim da linha | descartada: vale sempre o primeiro valor |
| número de documento entre a descrição e o valor | removido da descrição |
| seções "Total de entradas" / "Total de saídas" com lançamentos sem sinal (Nubank) | a seção do dia define o sinal |
| lançamento que sobra no topo da página seguinte | a data atravessa a página |
| CPF mascarado no meio da descrição (`•••.871.467-••`) | removido |
| sem sinal nenhum (faturas) | entra como saída; "recebido", "salário", "depósito" e afins viram entrada |

Há um teste por formato em `src/engine/__tests__/bancos.test.ts`, cobrindo Nubank (fatura e extrato), Bradesco, Banco do Brasil, Itaú, Inter, Neon, Banco Pan e BrasilCard, mais um que monta um PDF com fonte Identity-H de verdade para exercitar a decodificação pelo `/ToUnicode`.

O formato do Nubank foi **conferido contra um extrato real**: as 26 linhas saíram com data, descrição e sinal corretos, e a soma bateu com os totais que o próprio documento declara (entradas e saídas, ao centavo). Os PDFs dos testes são reconstruções desse layout, não o arquivo original. Os outros sete bancos são modelados a partir do formato típico de cada um e **ainda precisam ser validados com arquivos reais**. Se um extrato não for lido, a tela mostra o texto que o app conseguiu extrair — é isso que permite ajustar o leitor.
**Limites honestos:** PDF digitalizado (foto ou scan) não tem texto e não dá para ler — o app avisa e pede CSV/OFX. PDF protegido por senha também não abre, e o app diz isso. Fontes com codificação própria podem sair ilegíveis. Quando a linha não traz sinal nem `C`/`D`, o lançamento entra como saída e o app avisa: na prévia dá para tocar e escolher uma categoria de receita para virar entrada. **CSV e OFX continuam sendo os formatos mais confiáveis.**

### Se o arquivo não abrir
A leitura tenta, em ordem: o Blob do navegador, o `expo-file-system` (celular) e `fetch` do endereço do arquivo (resolve `file://`, `content://`, `blob:` e `data:`). Se as três falharem, a tela mostra o que foi tentado. Se o arquivo abrir mas nada for reconhecido, a tela mostra as primeiras linhas do arquivo, para dar para ver o que o app leu. Há também um botão **Testar com um extrato de exemplo**, que importa sem depender de arquivo — serve para separar "o seletor de arquivos falhou" de "meu arquivo não foi entendido".

## Estrutura
```
src/engine/     cálculos, dicas, categorizador, importadores (puro TS + testes)
src/data/       contexto do app, armazenamento local e Supabase
src/app/        telas (Expo Router)
src/components/ UI, gráficos (react-native-svg) e animações (motion.tsx)
src/notifications/
supabase/schema.sql
```

## Próximos passos possíveis
Open Finance via agregador (ex.: Pluggy) — exige um backend para guardar as chaves; metas por objetivo; lançamentos recorrentes; exportar relatório; sincronização de categorias personalizadas.
