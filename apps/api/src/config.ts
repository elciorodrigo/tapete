function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

const opcional = (name: string) => process.env[name]?.trim() ?? "";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  flowMode: (process.env.FLOW_MODE === "published" ? "published" : "draft") as "draft" | "published",
  flowPrivateKeyPem: opcional("PRIVATE_KEY"),
  flowPrivateKeyPath: opcional("FLOW_PRIVATE_KEY_PATH") || "/app/keys/flow_private.pem",
  flowPrivateKeyPassphrase: opcional("PASSPHRASE") || opcional("FLOW_PRIVATE_KEY_PASSPHRASE"),
  precosPath: process.env.PRECOS_PATH ?? "/app/config/precos.json",
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:4321,http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE !== "false",
  devToken: opcional("DEV_TOKEN"),
  meta: {
    accessToken: opcional("GRAPH_API_TOKEN") || opcional("META_ACCESS_TOKEN"),
    phoneNumberId: opcional("BUSINESS_PHONE_NUMBER_ID") || opcional("business_phone_number_id") || opcional("META_PHONE_NUMBER_ID"),
    wabaId: opcional("META_WABA_ID"),
    appSecret: opcional("META_APP_SECRET"),
    webhookVerifyToken: opcional("META_WEBHOOK_VERIFY_TOKEN"),
    flowId: opcional("META_FLOW_ID"),
    graphVersion: opcional("META_GRAPH_VERSION") || "v22.0",
    templateStatus: opcional("META_TEMPLATE_STATUS"),
  },
};
