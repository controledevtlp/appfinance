# Finanças Claras

App de controle financeiro para **Android e iOS** (Expo / React Native + TypeScript) com painel, orçamento ideal,
dicas de economia e importação de extrato. Dados na nuvem via **Supabase** (ou só no aparelho, em modo local).

## O que tem

| Tela | O que faz |
|---|---|
| **Painel** | Quanto sobrou no mês, nota de saúde financeira (0–100, explicada), regra 50/30/20, para onde vai o dinheiro, últimos 6 meses, reserva de emergência e principais dicas |
| **Lançamentos** | Lista por dia com busca e filtro; adicionar/editar/excluir; categoria sugerida automaticamente pela descrição |
| **Orçamento** | Limite ideal por categoria (calculado sobre a sua renda), barras de uso, limites personalizáveis |
| **Dicas** | Alertas ordenados por gravidade, cada um com **plano de melhoria em etapas** e economia mensal estimada |
| **Importar extrato** | CSV (vários bancos, fatura de cartão) e OFX, com prévia, correção de categoria e descarte de duplicados |
| **Ajustes** | Renda líquida, reserva atual, notificações, dados de exemplo, conta |

### Como os cálculos funcionam (`src/engine`)
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

Todo o motor é TypeScript puro e testado: `npm test` (38 testes).

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

## Importar extrato
No app/internet banking, exporte o extrato em **CSV ou OFX** (ou a fatura do cartão) e escolha o arquivo em *Importar extrato*.
- Detecta separador (`;`/`,`), cabeçalho (mesmo com linhas de preâmbulo), valores `1.234,56`, colunas separadas de débito/crédito e acentos em Latin-1.
- Fatura de cartão (positivo = compra) é detectada, ou ligue a chave manualmente.
- Pagamento de fatura e transferências ficam em “Transferência” e **não** entram nas contas, para não contar gasto em dobro.
- Reimportar o mesmo arquivo não duplica (identificador do banco ou hash estável).

## Estrutura
```
src/engine/     cálculos, dicas, categorizador, importadores (puro TS + testes)
src/data/       contexto do app, armazenamento local e Supabase
src/app/        telas (Expo Router)
src/components/ UI e gráficos (react-native-svg)
src/notifications/
supabase/schema.sql
```

## Próximos passos possíveis
Open Finance via agregador (ex.: Pluggy) — exige um backend para guardar as chaves; metas por objetivo; lançamentos recorrentes; exportar relatório; sincronização de categorias personalizadas.
