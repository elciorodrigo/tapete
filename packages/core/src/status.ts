export const STATUS = [
  "NOVO",
  "CONFIRMADO",
  "COLETA_AGENDADA",
  "COLETADO",
  "EM_LAVAGEM",
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
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  NOVO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["COLETA_AGENDADA", "CANCELADO"],
  COLETA_AGENDADA: ["COLETADO", "CANCELADO"],
  COLETADO: ["EM_LAVAGEM"],
  EM_LAVAGEM: ["PRONTO"],
  PRONTO: ["ENTREGUE"],
  ENTREGUE: [],
  CANCELADO: [],
};

export function proximosStatus(atual: StatusPedido): StatusPedido[] {
  return TRANSICOES[atual];
}

export function podeMudarStatus(de: StatusPedido, para: StatusPedido): boolean {
  return TRANSICOES[de].includes(para);
}
