import {
  ErroOrcamento,
  calcularOrcamento,
  formatarBRL,
  formatarCep,
  normalizarCep,
  paraCentavos,
  unidadePorCep,
  type Catalogo,
  type ItemCalculado,
  type Modalidade,
  type Orcamento,
  type Unidade,
} from "@tapete/core";

export type ItemFluxo = {
  tipo: string;
  formato: "retangular" | "redondo";
  largura?: number;
  comprimento?: number;
  diametro?: number;
  adicionais: string[];
};

export type EnderecoFluxo = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  referencia: string;
  cidade: string;
  uf: string;
};

export type EstadoFluxo = {
  nome?: string;
  cep?: string;
  unidadeId?: string;
  itens: ItemFluxo[];
  modalidade?: Modalidade;
  periodo?: string;
  endereco?: EnderecoFluxo;
  pagamento?: string;
  pedidoNumero?: string;
  via?: EnderecoViaCep;
};

export type EnderecoViaCep = { logradouro: string; bairro: string; localidade: string; uf: string };

export type ResultadoCep =
  | { situacao: "ok"; endereco: EnderecoViaCep }
  | { situacao: "inexistente" }
  | { situacao: "indisponivel" };

export type PedidoFluxo = {
  nome: string;
  cep: string;
  unidadeId: string;
  modalidade: Modalidade;
  periodo: string | null;
  endereco: EnderecoFluxo | null;
  pagamento: string;
  itens: ItemFluxo[];
};

export type EfeitoFluxo =
  | { tipo: "protocolo"; resposta: unknown }
  | { tipo: "tela"; resposta: unknown; estado: EstadoFluxo }
  | { tipo: "gravar"; resposta: (numero: string) => unknown; estado: EstadoFluxo; pedido: PedidoFluxo };

export function estadoInicial(): EstadoFluxo {
  return { itens: [] };
}

type Pedido = {
  action?: string;
  screen?: string;
  data?: unknown;
  flow_token?: string;
};

function dados(body: Pedido): Record<string, unknown> {
  return body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? (body.data as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function ids(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (typeof valor === "string" && valor) return [valor];
  return [];
}

function metros(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saudacao(nome?: string): string {
  const quem = nome?.trim();
  return quem
    ? `Olá, ${quem}! Aqui é a Tapetê. Vamos montar o orçamento do seu tapete.`
    : "Olá! Aqui é a Tapetê. Vamos montar o orçamento do seu tapete.";
}

function tela(screen: string, data: Record<string, unknown>, estado: EstadoFluxo, erro?: string): EfeitoFluxo {
  return {
    tipo: "tela",
    estado,
    resposta: { version: "3.0", screen, data: erro ? { ...data, error_message: erro } : data },
  };
}

function sucesso(flowToken: string, numeroPedido: string, pagamento: string): unknown {
  return {
    version: "3.0",
    screen: "SUCCESS",
    data: {
      extension_message_response: {
        params: { flow_token: flowToken, pedido: numeroPedido, pagamento },
      },
    },
  };
}

function unidadeDe(estado: EstadoFluxo, catalogo: Catalogo): Unidade | null {
  return catalogo.unidades.find((u) => u.id === estado.unidadeId) ?? null;
}

function dadosTapete(unidade: Unidade): Record<string, unknown> {
  return {
    unidade_texto: `Atendimento: ${unidade.nome}`,
    tipos: unidade.tipos.map((t) => ({
      id: t.id,
      title: t.nome,
      description: `${formatarBRL(paraCentavos(t.preco_m2))}/m²`,
    })),
    adicionais: unidade.adicionais.map((a) => ({
      id: a.id,
      title: a.nome,
      description: `+ ${formatarBRL(paraCentavos(a.preco_m2))}/m²`,
    })),
  };
}

function dadosEntrega(estado: EstadoFluxo, unidade: Unidade, catalogo: Catalogo): Record<string, unknown> {
  const modalidades = [
    {
      id: "coleta",
      title: "Coletar e entregar em casa",
      description: `Taxa de ${formatarBRL(paraCentavos(unidade.taxa_coleta))}`,
    },
  ];
  if (unidade.aceita_balcao) {
    modalidades.push({ id: "balcao", title: "Levo e retiro na loja", description: unidade.endereco_loja });
  }
  return {
    nome: estado.nome ?? "",
    modalidades,
    periodos: catalogo.periodos.map((p) => ({ id: p.id, title: p.nome })),
    show_cupom: false,
  };
}

function medidasTexto(item: ItemCalculado): string {
  return item.medidas.formato === "redondo"
    ? `redondo, ${metros(item.medidas.diametro)} m`
    : `${metros(item.medidas.largura)} × ${metros(item.medidas.comprimento)} m`;
}

function orcamentoDe(estado: EstadoFluxo, unidade: Unidade, modalidade: Modalidade): Orcamento {
  return calcularOrcamento(
    estado.itens.map((item) =>
      item.formato === "redondo"
        ? { tipo: item.tipo, medidas: { formato: "redondo" as const, diametro: item.diametro ?? 0 }, adicionais: item.adicionais }
        : {
            tipo: item.tipo,
            medidas: { formato: "retangular" as const, largura: item.largura ?? 0, comprimento: item.comprimento ?? 0 },
            adicionais: item.adicionais,
          },
    ),
    unidade,
    modalidade,
  );
}

function resumoItens(orc: Orcamento): string {
  const linhas = orc.itens.map((item, i) => {
    const extras = item.adicionais_nomes.length ? `\n${item.adicionais_nomes.join(", ")}` : "";
    return `**${i + 1}. ${item.tipo_nome}** · ${medidasTexto(item)} (${metros(item.area_m2)} m²)${extras}\n${formatarBRL(item.valor)}`;
  });
  return `${linhas.join("\n\n")}\n\n**Subtotal: ${formatarBRL(orc.subtotal)}**`;
}

function resumoProposta(orc: Orcamento, modalidade: Modalidade, periodo: string): string {
  const linhas = orc.itens.map(
    (item, i) => `**${i + 1}. ${item.tipo_nome}** · ${medidasTexto(item)} · ${formatarBRL(item.valor)}`,
  );
  const taxa = modalidade === "coleta" ? `\nTaxa de coleta e entrega: ${formatarBRL(orc.taxa_coleta)}` : "";
  const ajuste = orc.ajuste_minimo > 0 ? `\nAjuste para o pedido mínimo: ${formatarBRL(orc.ajuste_minimo)}` : "";
  const quando = modalidade === "coleta" ? `\n\nColeta: ${periodo}` : "\n\nRetirada na loja";
  return `${linhas.join("\n")}${taxa}${ajuste}\n**Total estimado: ${formatarBRL(orc.total)}**${quando}\nPrazo de devolução: até 7 dias úteis`;
}

const DESTAQUES =
  "**Importante**\n• O valor é estimado e confirmado na medição da coleta.\n• Pode haver migração mínima de cor em tapetes tingidos.";

function dadosProposta(estado: EstadoFluxo, unidade: Unidade, catalogo: Catalogo): Record<string, unknown> {
  const modalidade = estado.modalidade ?? "balcao";
  const orc = orcamentoDe(estado, unidade, modalidade);
  const periodo = catalogo.periodos.find((p) => p.id === estado.periodo)?.nome ?? "A combinar";
  return {
    unidade_texto: unidade.nome,
    resumo: resumoProposta(orc, modalidade, periodo),
    destaques: DESTAQUES,
    formas_pagamento: catalogo.formas_pagamento.map((f) => ({
      id: f.id,
      title: f.nome,
      description: f.id === "pix" ? "Código enviado aqui no WhatsApp" : "Link de pagamento seguro",
    })),
    termos_url: catalogo.termos_url,
  };
}

function semUnidade(estado: EstadoFluxo): EfeitoFluxo {
  return tela("LOCAL", { saudacao: saudacao(estado.nome) }, estado, "Informe o CEP para continuar.");
}

export async function tratarFluxo(
  body: Pedido,
  estado: EstadoFluxo,
  catalogo: Catalogo,
  flowToken: string,
  consultarCep: (cep: string) => Promise<ResultadoCep>,
): Promise<EfeitoFluxo> {
  if (body.action === "ping") return { tipo: "protocolo", resposta: { data: { status: "active" } } };

  const data = dados(body);
  if (data.error) return { tipo: "protocolo", resposta: { data: { acknowledged: true } } };

  if (body.action === "INIT") {
    return tela("LOCAL", { saudacao: saudacao(estado.nome) }, estado);
  }

  if (body.action === "BACK") {
    const unidade = unidadeDe(estado, catalogo);
    if (body.screen === "TAPETE" && unidade) return tela("TAPETE", dadosTapete(unidade), estado);
    if (body.screen === "ITENS" && unidade) {
      return tela("ITENS", { resumo: resumoItens(orcamentoDe(estado, unidade, "balcao")) }, estado);
    }
    if (body.screen === "ENTREGA" && unidade) return tela("ENTREGA", dadosEntrega(estado, unidade, catalogo), estado);
    if (body.screen === "PROPOSTA" && unidade && estado.itens.length) {
      return tela("PROPOSTA", dadosProposta(estado, unidade, catalogo), estado);
    }
    return tela("LOCAL", { saudacao: saudacao(estado.nome) }, estado);
  }

  if (body.action !== "data_exchange") {
    return tela("LOCAL", { saudacao: saudacao(estado.nome) }, estado, "Não entendi este passo. Tente de novo.");
  }

  const step = texto(data.step);
  const unidade = unidadeDe(estado, catalogo);

  if (step === "CEP") {
    const local = { saudacao: saudacao(estado.nome) };
    const cep = normalizarCep(texto(data.cep));
    if (!cep) return tela("LOCAL", local, estado, "CEP inválido. Use 00000-000.");
    const consulta = await consultarCep(cep);
    if (consulta.situacao === "inexistente") {
      return tela("LOCAL", local, estado, "Não encontramos esse CEP. Confira os números.");
    }
    if (consulta.situacao !== "ok") {
      return tela("LOCAL", local, estado, "Não consegui conferir o CEP agora. Tente de novo.");
    }
    const encontrada = unidadePorCep(catalogo, cep);
    const proximo = { ...estado, cep, via: consulta.endereco };
    if (!encontrada) {
      return tela(
        "FORA_AREA",
        { mensagem: `Ainda não temos unidade atendendo o CEP ${formatarCep(cep)}.` },
        proximo,
      );
    }
    return tela("TAPETE", dadosTapete(encontrada), { ...proximo, unidadeId: encontrada.id });
  }

  if (!unidade) return semUnidade(estado);

  if (step === "TAPETE_ADD") {
    const formato = texto(data.formato);
    const adicionais = ids(data.adicionais);
    let item: ItemFluxo;
    if (formato === "redondo") {
      const diametro = numero(data.diametro);
      if (diametro == null) {
        return tela("TAPETE", dadosTapete(unidade), estado, "Informe o diâmetro do tapete.");
      }
      item = { tipo: texto(data.tipo), formato: "redondo", diametro, adicionais };
    } else if (formato === "retangular") {
      const largura = numero(data.largura);
      const comprimento = numero(data.comprimento);
      if (largura == null || comprimento == null) {
        return tela("TAPETE", dadosTapete(unidade), estado, "Informe a largura e o comprimento.");
      }
      item = { tipo: texto(data.tipo), formato: "retangular", largura, comprimento, adicionais };
    } else {
      return tela("TAPETE", dadosTapete(unidade), estado, "Escolha o formato do tapete.");
    }

    const proximo = { ...estado, itens: [...estado.itens, item] };
    try {
      const orc = orcamentoDe(proximo, unidade, "balcao");
      return tela("ITENS", { resumo: resumoItens(orc) }, proximo);
    } catch (err) {
      const msg = err instanceof ErroOrcamento ? err.message : "Não foi possível calcular este tapete.";
      return tela("TAPETE", dadosTapete(unidade), estado, msg);
    }
  }

  if (step === "ITENS") {
    if (estado.itens.length === 0) return tela("TAPETE", dadosTapete(unidade), estado, "Adicione um tapete para continuar.");
    if (texto(data.proximo) === "adicionar") return tela("TAPETE", dadosTapete(unidade), estado);
    if (texto(data.proximo) === "continuar") return tela("ENTREGA", dadosEntrega(estado, unidade, catalogo), estado);
    return tela("ITENS", { resumo: resumoItens(orcamentoDe(estado, unidade, "balcao")) }, estado, "Escolha se quer adicionar outro tapete ou continuar.");
  }

  if (step === "ENTREGA") {
    const nome = texto(data.nome);
    if (nome.length < 2) return tela("ENTREGA", dadosEntrega(estado, unidade, catalogo), estado, "Informe seu nome.");
    if (texto(data.cupom)) {
      return tela("ENTREGA", dadosEntrega({ ...estado, nome }, unidade, catalogo), { ...estado, nome }, "Cupom indisponível neste teste.");
    }
    const modalidade = texto(data.modalidade);
    if (modalidade !== "coleta" && modalidade !== "balcao") {
      return tela("ENTREGA", dadosEntrega({ ...estado, nome }, unidade, catalogo), { ...estado, nome }, "Escolha coleta ou retirada na loja.");
    }
    if (modalidade === "balcao" && !unidade.aceita_balcao) {
      return tela("ENTREGA", dadosEntrega({ ...estado, nome }, unidade, catalogo), { ...estado, nome }, "Esta unidade não atende no balcão.");
    }
    const periodo = texto(data.periodo) || catalogo.periodos[0]?.id || "";
    if (periodo && !catalogo.periodos.some((p) => p.id === periodo)) {
      return tela("ENTREGA", dadosEntrega({ ...estado, nome }, unidade, catalogo), { ...estado, nome }, "Escolha um período de coleta.");
    }
    const proximo: EstadoFluxo = { ...estado, nome, modalidade, periodo };
    if (modalidade === "balcao") return tela("PROPOSTA", dadosProposta(proximo, unidade, catalogo), proximo);

    const via = await enderecoDoCep(proximo, consultarCep);
    if (!via) {
      return tela("ENTREGA", dadosEntrega(proximo, unidade, catalogo), proximo, "Não consegui confirmar o CEP. Volte e informe o CEP de novo.");
    }
    const comVia = { ...proximo, via };
    return tela(
      "ENDERECO",
      {
        cep_texto: `CEP ${formatarCep(comVia.cep ?? "")} · ${via.localidade}/${via.uf}`,
        logradouro: via.logradouro,
        bairro: via.bairro,
      },
      comVia,
    );
  }

  if (step === "ENDERECO") {
    const endereco: EnderecoFluxo = {
      logradouro: texto(data.logradouro),
      numero: texto(data.numero),
      complemento: texto(data.complemento),
      bairro: texto(data.bairro),
      referencia: texto(data.referencia),
      cidade: estado.via?.localidade ?? "",
      uf: estado.via?.uf ?? "",
    };
    const base = {
      cep_texto: `CEP ${formatarCep(estado.cep ?? "")}`,
      logradouro: endereco.logradouro,
      bairro: endereco.bairro,
    };
    if (!endereco.logradouro || !endereco.numero || !endereco.bairro) {
      return tela("ENDERECO", base, estado, "Informe rua, número e bairro.");
    }
    const proximo = { ...estado, modalidade: "coleta" as const, endereco };
    return tela("PROPOSTA", dadosProposta(proximo, unidade, catalogo), proximo);
  }

  if (step === "CONFIRMAR") {
    if (!estado.itens.length || !estado.modalidade || !estado.cep) return semUnidade(estado);
    const proposta = dadosProposta(estado, unidade, catalogo);
    const aceitou = data.termos === true || data.termos === "true";
    if (!aceitou) return tela("PROPOSTA", proposta, estado, "Aceite os termos para confirmar o pedido.");
    const pagamento = texto(data.pagamento);
    if (!catalogo.formas_pagamento.some((f) => f.id === pagamento)) {
      return tela("PROPOSTA", proposta, estado, "Escolha a forma de pagamento.");
    }
    if (estado.pedidoNumero) {
      return {
        tipo: "tela",
        estado,
        resposta: sucesso(flowToken, estado.pedidoNumero, estado.pagamento ?? pagamento),
      };
    }
    const proximo = { ...estado, pagamento };
    return {
      tipo: "gravar",
      estado: proximo,
      pedido: {
        nome: proximo.nome?.trim() || "Cliente",
        cep: proximo.cep!,
        unidadeId: unidade.id,
        modalidade: proximo.modalidade!,
        periodo: proximo.periodo ?? null,
        endereco: proximo.endereco ?? null,
        pagamento,
        itens: proximo.itens,
      },
      resposta: (numero) => sucesso(flowToken, numero, pagamento),
    };
  }

  return tela(body.screen || "LOCAL", { saudacao: saudacao(estado.nome) }, estado, "Não entendi este passo. Tente de novo.");
}

async function enderecoDoCep(
  estado: EstadoFluxo,
  consultarCep: (cep: string) => Promise<ResultadoCep>,
): Promise<EnderecoViaCep | null> {
  if (estado.via) return estado.via;
  if (!estado.cep) return null;
  const consulta = await consultarCep(estado.cep);
  return consulta.situacao === "ok" ? consulta.endereco : null;
}

export async function consultarViaCep(cep: string): Promise<ResultadoCep> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { situacao: "indisponivel" };
    const json = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (json.erro || !json.localidade || !json.uf) return { situacao: "inexistente" };
    return {
      situacao: "ok",
      endereco: {
        logradouro: json.logradouro ?? "",
        bairro: json.bairro ?? "",
        localidade: json.localidade,
        uf: json.uf,
      },
    };
  } catch {
    return { situacao: "indisponivel" };
  }
}

