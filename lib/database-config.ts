/** Keep this app and its migration history isolated from other database schemas. */
export const DATABASE_SCHEMA = "novelai_tags";

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("请设置 DATABASE_URL（PostgreSQL 连接字符串）。");
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL 必须使用 PostgreSQL。");
  }
  url.searchParams.set("schema", DATABASE_SCHEMA);
  return url.toString();
}
