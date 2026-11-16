function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  flowMode: (process.env.FLOW_MODE ?? "draft") as "draft" | "published",
  precosPath: process.env.PRECOS_PATH ?? "/app/config/precos.json",
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:4321,http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
