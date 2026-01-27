import mysql from "mysql2";

if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}

const {
  DB_HOST,
  DB_USER,
  DB_PASS,
  DB_PASSWORD,
  DB_NAME,
  DB_DATABASE,
  DB_PORT,
  DB_SOCKET_PATH,
  INSTANCE_CONNECTION_NAME,
} = process.env;

// For Cloud SQL: prefer socket if INSTANCE_CONNECTION_NAME/DB_SOCKET_PATH is provided
const socketPath =
  DB_SOCKET_PATH ??
  (INSTANCE_CONNECTION_NAME ? `/cloudsql/${INSTANCE_CONNECTION_NAME}` : undefined);

if (process.env.NODE_ENV === "production" && !DB_HOST && !socketPath) {
  throw new Error("DB_HOST or Cloud SQL socket is required in production");
}

const dbPort = DB_PORT ? Number(DB_PORT) : undefined;

const resolvedDatabase = DB_NAME ?? DB_DATABASE ?? "storeDB";

const baseConfig = {
  user: DB_USER,
  password: DB_PASS ?? DB_PASSWORD,
  database: resolvedDatabase,
};

const dbConfig = socketPath
  ? { ...baseConfig, socketPath }
  : { ...baseConfig, host: DB_HOST, port: dbPort ?? 3306 };

const db = mysql.createConnection(dbConfig);

// DATABASE CONNECTION
db.connect((err) => {
  if (err) {
    console.error("❌ MySQL bağlantı hatası:", err);
  } else {
    const target =
      socketPath ??
      `${DB_HOST ?? "localhost"}:${dbConfig.port ?? ""}`.replace(/:$/, "");
    console.log(`✅ MySQL'e bağlanıldı! target=${target} db=${resolvedDatabase} user=${DB_USER ?? "unknown"}`);
  }
});

export default db;
