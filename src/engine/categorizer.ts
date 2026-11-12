import type { TxType } from './types';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave para agrupar lançamentos que são "a mesma coisa" em meses diferentes.
 * Descarta pontuação e números, então "PARCELA 3/10" e "PARCELA 4/10" caem no
 * mesmo grupo, assim como "NETFLIX.COM  *123" e "NETFLIX COM".
 */
export function groupingKey(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ordem importa: a primeira regra que casar vence. Textos já sem acento e em minúsculas. */
const RULES: { categoryId: string; re: RegExp; only?: TxType }[] = [
  { categoryId: 'transferencia', re: /pagamento (de )?fatura|pgto fatura|pag fatura|pagamento recebido|saldo anterior|pagamento on ?line|fatura (cartao|paga)/ },
  { categoryId: 'investimentos', re: /aplicacao|investiment|\bcdb\b|\brdb\b|tesouro|corretora|cofrinho|caixinha|nuinvest|xp invest|rico invest|resgate programado/, only: 'expense' },
  { categoryId: 'transferencia', re: /resgate|rendimento bruto/, only: 'income' },
  { categoryId: 'salario', re: /salario|folha de pagamento|proventos|vencimentos|pagamento de salario|adiantamento salarial|13o/, only: 'income' },
  { categoryId: 'renda_extra', re: /freela|honorario|comissao|servico prestado|pix recebido pj|nota fiscal/, only: 'income' },
  { categoryId: 'delivery', re: /ifood|rappi|uber ?eats|99 ?food|restaurante|lanchonete|pizzaria|pizza|hamburguer|burger|mcdonald|bk brasil|subway|outback|starbucks|padaria|cafeteria|sorveteria|churrascaria|sushi|habib|spoleto|madero|giraffas|lanches|acai|boteco|\bbar\b/ },
  { categoryId: 'assinaturas', re: /netflix|spotify|amazon prime|prime video|disney|hbo|globoplay|youtube ?(premium|music)|apple\.com|itunes|icloud|google (one|storage)|deezer|paramount|crunchyroll|telecine|premiere|microsoft 365|office 365|adobe|dropbox|chatgpt|openai|claude\.ai|github|notion|canva|assinatura|tinder|bumble/ },
  { categoryId: 'moradia', re: /aluguel|condominio|iptu|financiamento imob|imobiliaria|quinto andar/ },
  { categoryId: 'contas', re: /\benel\b|cemig|copel|\blight\b|cpfl|energisa|equatorial|neoenergia|sabesp|copasa|sanepar|embasa|comgas|naturgy|\bvivo\b|\bclaro\b|\btim\b|oi fibra|internet|telefon|conta de (luz|agua|gas)|celular|energia eletrica|\bgas\b/ },
  { categoryId: 'mercado', re: /mercado(?! livre| pago)|supermercad|carrefour|assai|atacadao|pao de acucar|sacolao|hortifruti|atacarejo|zaffari|condor|angeloni|guanabara|prezunic|mambo|bretas|supernosso|acougue|verdemar/ },
  { categoryId: 'transporte', re: /\buber\b|\b99 ?(pop|taxi|app)?\b|cabify|combustivel|\bposto\b|shell|ipiranga|petrobras|gasolina|etanol|estacionamento|pedagio|sem parar|conectcar|metro|cptm|bilhete unico|onibus|passagem|vlt|oficina|ipva|seguro auto|detran|licenciamento|lava ?jato/ },
  { categoryId: 'saude', re: /farmacia|drogaria|drogasil|raia|pacheco|panvel|pague menos|hospital|clinica|laboratorio|consulta|dentista|odonto|unimed|amil|hapvida|plano de saude|medic|exame|academia|smart ?fit|bluefit|gympass|totalpass|wellhub|psicolog|terapia/ },
  { categoryId: 'educacao', re: /escola|faculdade|universidade|curso|udemy|alura|colegio|mensalidade|livraria|estacio|unip|anhanguera|duolingo|coursera|idioma|ingles/ },
  // Antes de "dívidas": financiamento de veículo tem categoria própria.
  { categoryId: 'veiculo', re: /financiamento (do |de )?(carro|veiculo|moto|auto)|presta[cç][aã]o do (carro|moto)|parcela (do|da) (carro|moto|financiamento)|cons[oó]rcio|banco honda|\bhonda\b|bv financeira|aymore|losango|omni financeira|santander financiamento|itau veiculos|porto seguro financ/, only: 'expense' },
  { categoryId: 'dividas', re: /emprestimo|consignado|cheque especial|rotativo|refinanci|renegoc|financiamento|crediario|\bjuros\b|\biof\b|encargo|multa|\bmora\b/ },
  { categoryId: 'cuidados', re: /salao|barbearia|barbeiro|cabeleireir|manicure|estetica|boticario|natura|sephora|perfumaria|beleza|depil|massagem/ },
  { categoryId: 'lazer', re: /cinema|ingresso|teatro|\bshow\b|sympla|eventim|ticketmaster|hotel|airbnb|booking|decolar|latam|gol linhas|azul linhas|passagem aerea|viagem|parque|steam|playstation|xbox|nintendo|clube/ },
  { categoryId: 'compras', re: /amazon|mercado ?livre|shopee|aliexpress|shein|magalu|magazine luiza|americanas|casas bahia|ponto frio|fast shop|kabum|renner|\bc&a\b|riachuelo|zara|marisa|centauro|netshoes|decathlon|leroy|tok&stok|ikea|kalunga|havan|submarino|shoptime|loja|dafiti|nike|adidas/ },
  { categoryId: 'outros', re: /tarifa|anuidade|cesta de servi|taxa de manuten/ },
  // Depois dos lojistas: "NOTEBOOK PARCELA 3/10" vira dívida, mas "MAGAZINE LUIZA PARC 2/3" fica em compras.
  { categoryId: 'dividas', re: /\bparcela\b|\bparc\b|\bprestacao\b|\bparcelado\b/, only: 'expense' },
];

export function categorize(description: string, type: TxType): string {
  const text = normalize(description);
  for (const rule of RULES) {
    if (rule.only && rule.only !== type) continue;
    if (rule.re.test(text)) return rule.categoryId;
  }
  return type === 'income' ? 'outras_receitas' : 'outros';
}
