export const STATUS = [
  "NOVO",
  "CONFIRMADO",
  "COLETA_AGENDADA",
  "COLETADO",
  "EM_LAVAGEM",
  "EM_SECAGEM",
  "PRONTO",
  "ENTREGUE",
  "CANCELADO",
] as const;

export type StatusPedido = (typeof STATUS)[number];

export const STATUS_ROTULO: Record<StatusPedido, string> = {
  NOVO: "Novo",
  CONFIRMADO: "Confirmado",
  COLETA_AGENDADA: "Coleta agendada",
  COLETADO: "Coletado",
  EM_LAVAGEM: "Em lavagem",
  EM_SECAGEM: "Em secagem",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  NOVO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["COLETA_AGENDADA", "CANCELADO"],
  COLETA_AGENDADA: ["COLETADO", "CANCELADO"],
  COLETADO: ["EM_LAVAGEM"],
  EM_LAVAGEM: ["EM_SECAGEM"],
  EM_SECAGEM: ["PRONTO"],
  PRONTO: ["ENTREGUE"],
  ENTREGUE: [],
  CANCELADO: [],
};

export function ehStatus(valor: unknown): valor is StatusPedido {
  return typeof valor === "string" && (STATUS as readonly string[]).includes(valor);
}

export function proximosStatus(atual: StatusPedido): StatusPedido[] {
  return TRANSICOES[atual];
}

export function podeMudarStatus(de: StatusPedido, para: StatusPedido): boolean {
  return TRANSICOES[de].includes(para);
}

const MENSAGEM_STATUS: Record<StatusPedido, (numero: string) => string> = {
  NOVO: (n) => `Recebemos seu pedido ${n}. Nossa equipe vai conferir e confirmar em breve.`,
  CONFIRMADO: (n) => `Seu pedido ${n} foi confirmado.`,
  COLETA_AGENDADA: (n) => `A coleta do seu pedido ${n} está agendada.`,
  COLETADO: (n) => `Coletamos os tapetes do pedido ${n}. Agora eles seguem para a lavagem.`,
  EM_LAVAGEM: (n) => `Seu pedido ${n} está em lavagem.`,
  EM_SECAGEM: (n) => `Seu pedido ${n} está em secagem.`,
  PRONTO: (n) => `Seu pedido ${n} está pronto! Vamos combinar a entrega.`,
  ENTREGUE: (n) => `Pedido ${n} entregue. Obrigado por escolher a Tapetê!`,
  CANCELADO: (n) => `Seu pedido ${n} foi cancelado.`,
};

/** Texto padrão do aviso ao cliente quando o pedido muda para `status`. */
export function mensagemStatus(status: StatusPedido, numero: string): string {
  return MENSAGEM_STATUS[status](numero);
}
