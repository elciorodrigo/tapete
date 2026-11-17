import type { FastifyBaseLogger } from "fastify";

export type TipoMensagem = "text" | "template" | "interactive";

export type ConfigWhatsApp = {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  flowId: string;
  flowMode: "draft" | "published";
};

export type RegistroEnvio = {
  quote_id: number | null;
  wa_id: string;
  kind: TipoMensagem;
  content: unknown;
  wamid: string | null;
  status: "sent" | "failed";
  error: string | null;
};

export type ResultadoEnvio = {
  ok: boolean;
  id: number;
  wa_id: string;
  wamid: string | null;
  erro: string | null;
};

export type Registrar = (r: RegistroEnvio) => Promise<number>;

export type WhatsApp = ReturnType<typeof criarWhatsApp>;

export const NAO_CONFIGURADO = "WhatsApp não configurado";

/** Só dígitos, com DDI. Números brasileiros sem DDI (10 ou 11 dígitos) ganham o 55. */
export function normalizarTelefone(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  const completo = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return /^[1-9]\d{9,14}$/.test(completo) ? completo : null;
}

export function criarWhatsApp(cfg: ConfigWhatsApp, registrar: Registrar, log: FastifyBaseLogger, fetchFn: typeof fetch = fetch) {
  const configurado = Boolean(cfg.accessToken && cfg.phoneNumberId);

  async function enviar(
    waId: string,
    kind: TipoMensagem,
    corpo: Record<string, unknown>,
    quoteId: number | null,
    erroPrevio?: string,
  ): Promise<ResultadoEnvio> {
    const payload = { messaging_product: "whatsapp", recipient_type: "individual", to: waId, type: kind, ...corpo };
    let erro = erroPrevio ?? (configurado ? null : NAO_CONFIGURADO);
    let wamid: string | null = null;
    let destino = waId;

    if (!erro) {
      try {
        const res = await fetchFn(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json().catch(() => ({}))) as {
          messages?: { id: string }[];
          contacts?: { wa_id?: string }[];
          error?: { message?: string; code?: number; error_data?: { details?: string } };
        };
        if (res.ok && json.messages?.[0]?.id) {
          wamid = json.messages[0].id;
          destino = json.contacts?.[0]?.wa_id ?? waId;
        } else {
          const e = json.error;
          erro = [e?.code, e?.error_data?.details ?? e?.message].filter(Boolean).join(" · ") || `HTTP ${res.status}`;
        }
      } catch (err) {
        erro = `Falha ao chamar a Meta: ${(err as Error).message}`;
      }
    }

    if (erro) log.warn({ waId, kind, erro }, "mensagem do WhatsApp não enviada");
    else log.info({ waId, kind, wamid }, "mensagem do WhatsApp enviada");

    const id = await registrar({
      quote_id: quoteId,
      wa_id: destino,
      kind,
      content: payload,
      wamid,
      status: erro ? "failed" : "sent",
      error: erro,
    });
    return { ok: !erro, id, wa_id: destino, wamid, erro };
  }

  return {
    configurado,

    enviarTexto(waId: string, texto: string, quoteId: number | null = null) {
      return enviar(waId, "text", { text: { body: texto, preview_url: false } }, quoteId);
    },

    enviarTemplate(waId: string, nome: string, parametros: string[], quoteId: number | null = null, idioma = "pt_BR") {
      return enviar(
        waId,
        "template",
        {
          template: {
            name: nome,
            language: { code: idioma },
            components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }],
          },
        },
        quoteId,
      );
    },

    enviarFlow(waId: string, flowToken: string) {
      const corpo = {
        interactive: {
          type: "flow",
          header: { type: "text", text: "Orçamento de tapetes" },
          body: { text: "Informe o CEP, o tipo e as medidas dos seus tapetes e veja o valor na hora." },
          footer: { text: "Tapetê – Lavanderia Profissional" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: flowToken,
              flow_id: cfg.flowId,
              flow_cta: "Fazer orçamento",
              flow_action: "data_exchange",
              mode: cfg.flowMode,
            },
          },
        },
      };
      return enviar(waId, "interactive", corpo, null, configurado && !cfg.flowId ? "META_FLOW_ID não configurado" : undefined);
    },

    /** Registra um aviso que não pôde ser enviado (ex.: fora da janela de 24 h). */
    registrarFalha(waId: string, kind: TipoMensagem, conteudo: unknown, erro: string, quoteId: number | null = null) {
      log.warn({ waId, kind, erro }, "mensagem do WhatsApp não enviada");
      return registrar({ quote_id: quoteId, wa_id: waId, kind, content: conteudo, wamid: null, status: "failed", error: erro }).then(
        (id): ResultadoEnvio => ({ ok: false, id, wa_id: waId, wamid: null, erro }),
      );
    },
  };
}
