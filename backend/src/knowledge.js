import { randomUUID } from "node:crypto";

export function knowledge(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(document_id UNINDEXED,name UNINDEXED,content, tokenize='unicode61 remove_diacritics 2');`);
  const list = () =>
    db.prepare("SELECT * FROM documents ORDER BY created DESC").all();
  const add = (name, text) => {
    const id = randomUUID();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO documents VALUES(?,?,?)").run(
        id,
        name,
        new Date().toISOString(),
      );
      for (let start = 0; start < text.length; start += 1000)
        db.prepare(
          "INSERT INTO chunks(document_id,name,content) VALUES(?,?,?)",
        ).run(id, name, text.slice(start, start + 1200));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { id, name };
  };
  const remove = (id) => {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM chunks WHERE document_id=?").run(id);
      db.prepare("DELETE FROM documents WHERE id=?").run(id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const search = (query) => {
    const stop = new Set([
      "como",
      "para",
      "qual",
      "quais",
      "sobre",
      "uma",
      "que",
      "com",
      "dos",
      "das",
      "por",
      "the",
      "and",
    ]);
    const words = [
      ...new Set(
        (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(
          (w) => !stop.has(w),
        ),
      ),
    ].slice(0, 16);
    if (!words.length) return [];
    return db
      .prepare(
        "SELECT rowid AS chunk_id,document_id,name,content FROM chunks WHERE chunks MATCH ? ORDER BY bm25(chunks) LIMIT 3",
      )
      .all(words.map((w) => `"${w}"`).join(" OR "));
  };
  return { list, add, remove, search };
}

// Arithmetic parser: no eval, JavaScript execution, network, or shell access.
export function calculate(expression) {
  if (
    typeof expression !== "string" ||
    expression.length > 200 ||
    /[^0-9.\s+*/()%\-]/.test(expression)
  )
    throw Error("Use apenas números, parênteses e + - * / %.");
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*/%\-]/g) || [];
  let i = 0;
  function atom() {
    const token = tokens[i++];
    if (token === "-") return -atom();
    if (token === "+") return atom();
    if (token === "(") {
      const value = sum();
      if (tokens[i++] !== ")") throw Error("Parênteses inválidos.");
      return value;
    }
    if (!/^\d+(?:\.\d+)?$/.test(token || ""))
      throw Error("Expressão inválida.");
    return Number(token);
  }
  function product() {
    let value = atom();
    while (["*", "/", "%"].includes(tokens[i])) {
      const op = tokens[i++];
      const right = atom();
      value =
        op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (["+", "-"].includes(tokens[i])) {
      const op = tokens[i++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = sum();
  if (i !== tokens.length || !Number.isFinite(value))
    throw Error("Expressão inválida ou divisão por zero.");
  return value;
}
const tool = (name, description, properties = {}, required = []) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  },
});
export const toolDefinitions = [
  tool(
    "search_documents",
    "Busca trechos nos documentos locais. Use para consultar informações da base de conhecimento.",
    { query: { type: "string", description: "Palavras-chave da busca" } },
    ["query"],
  ),
  tool("list_documents", "Lista os documentos disponíveis na base local."),
  tool(
    "calculator",
    "Calcula uma expressão aritmética. Use para contas exatas.",
    { expression: { type: "string" } },
    ["expression"],
  ),
  tool("current_time", "Retorna a data e hora atuais em America/Bahia."),
  tool("web_search", "Pesquisa informações atuais na internet e retorna títulos, links e trechos. Use para notícias, eventos, cargos, preços e fatos que podem mudar.", { query: { type: "string", description: "Termos específicos da busca" } }, ["query"]),
];
export function runTool(name, args, store) {
  switch (name) {
    case "calculator":
      return { result: calculate(args.expression) };
    case "current_time":
      return {
        datetime: new Date().toLocaleString("pt-BR", {
          timeZone: "America/Bahia",
        }),
        timezone: "America/Bahia",
      };
    case "list_documents":
      return store.list().map(({ id, name }) => ({ id, name }));
    case "search_documents":
      if (typeof args.query !== "string" || args.query.length > 1000)
        throw Error("Busca inválida.");
      return store.search(args.query);
    default:
      throw Error("Ferramenta não permitida.");
  }
}
