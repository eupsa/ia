import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, ndjson } from "../src/server.js";
import { calculate } from "../src/knowledge.js";

async function fixture(t, responder) {
  const calls = [];
  const { app, db } = createApp({
    dbPath: ":memory:",
    fetcher: async (url, options) => {
      if (url.endsWith("/api/tags"))
        return Response.json({ models: [{ name: "qwen3:0.6b" }] });
      const body = JSON.parse(options.body);
      calls.push(body);
      return responder
        ? responder(body, url)
        : new Response('{"message":{"content":"Olá!"},"done":true}\n');
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, body, method) =>
    fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      ...(body
        ? {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }
        : {}),
    });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  return { request, calls };
}
test("chat streams and persists history; deletion cascades", async (t) => {
  const { request } = await fixture(t);
  const chat = await (await request("/chats", {})).json();
  const response = await request(`/chats/${chat.id}/messages`, {
    content: "Olá",
    model: "qwen3:0.6b",
  });
  assert.match(await response.text(), /Olá!/);
  const data = await (await request("/chats/" + chat.id)).json();
  assert.equal(data.messages.length, 2);
  assert.equal(data.title, "Olá");
  assert.equal(
    (await request("/chats/" + chat.id, null, "DELETE")).status,
    204,
  );
  assert.equal((await request("/chats/" + chat.id)).status, 404);
});
test("RAG retrieves matching chunks and persists cited sources", async (t) => {
  const { request, calls } = await fixture(t);
  assert.equal(
    (
      await request("/documents", {
        name: "manual.md",
        text: "O projeto Nebulosa custa 450 reais e começa em novembro.",
      })
    ).status,
    201,
  );
  const chat = await (await request("/chats", {})).json();
  const response = await request(`/chats/${chat.id}/messages`, {
    content: "Quanto custa o projeto Nebulosa?",
    model: "qwen3:0.6b",
  });
  assert.match(await response.text(), /manual.md/);
  assert.match(calls[0].messages[1].content, /450 reais/);
  const data = await (await request("/chats/" + chat.id)).json();
  assert.equal(data.messages[1].sources[0].name, "manual.md");
  const docs = await (await request("/documents")).json();
  await request("/documents/" + docs[0].id, null, "DELETE");
  assert.deepEqual(await (await request("/documents")).json(), []);
});
test("native tool call executes and result is sent back to Ollama", async (t) => {
  let round = 0;
  const { request, calls } = await fixture(
    t,
    () =>
      new Response(
        JSON.stringify(
          ++round === 1
            ? {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      function: {
                        name: "calculator",
                        arguments: { expression: "(1250*12)/4" },
                      },
                    },
                  ],
                },
                done: true,
              }
            : { message: { content: "O resultado é 3750." }, done: true },
        ) + "\n",
      ),
  );
  const chat = await (await request("/chats", {})).json();
  const response = await request(`/chats/${chat.id}/messages`, {
    content: "Calcule",
    model: "qwen3:0.6b",
  });
  const body = await response.text();
  assert.match(body, /"result":3750/);
  assert.match(body, /O resultado é 3750/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-1).role, "tool");
  assert.match(calls[1].messages.at(-1).content, /3750/);
});
test("tools and RAG can be disabled; unsupported models and documents rejected", async (t) => {
  const { request, calls } = await fixture(t);
  const chat = await (await request("/chats", {})).json();
  assert.equal(
    (await request("/models/pull", { model: "arbitrary-model" })).status,
    400,
  );
  assert.equal(
    (await request("/documents", { name: "file.html", text: "<script/>" }))
      .status,
    400,
  );
  await request("/documents", {
    name: "a.txt",
    text: "Nebulosa é um projeto.",
  });
  await (
    await request(`/chats/${chat.id}/messages`, {
      content: "Nebulosa",
      model: "qwen3:0.6b",
      tools: false,
      rag: false,
    })
  ).text();
  assert.equal(calls[0].tools, undefined);
  assert.equal(calls[0].messages.length, 2);
  await (await request(`/chats/${chat.id}/messages`, {
    content: 'Olá novamente',
    model: 'qwen3:0.6b',
    rag: false,
    internet: false,
  })).text();
  assert.deepEqual(calls[1].tools.map(tool => tool.function.name).sort(), ['calculator', 'current_time']);
});
test("download progress reaches completion independently from polling browser", async (t) => {
  const { request } = await fixture(
    t,
    () =>
      new Response(
        '{"status":"downloading","total":100,"completed":50}\n{"status":"success"}\n',
      ),
  );
  assert.equal(
    (await request("/models/pull", { model: "qwen3:1.7b" })).status,
    202,
  );
  const models = await (await request("/models")).json();
  assert.equal(models[1].download.status, "done");
});
test("Ollama failures produce actionable errors without fake assistant messages", async (t) => {
  const { request } = await fixture(
    t,
    () => new Response("unavailable", { status: 500 }),
  );
  const chat = await (await request("/chats", {})).json();
  assert.equal(
    (
      await request(`/chats/${chat.id}/messages`, {
        content: "Olá",
        model: "qwen3:0.6b",
      })
    ).status,
    502,
  );
  assert.equal(
    (await (await request("/chats/" + chat.id)).json()).messages.length,
    0,
  );
});
test("calculator handles precedence and refuses code and non-finite values", () => {
  assert.equal(calculate("-(2 + 3) * 4 + 10 / 2"), -15);
  for (const value of ["process.exit()", "1/0", "2 3", "2..3", ""])
    assert.throws(() => calculate(value));
});
test("NDJSON decoder preserves split UTF-8 tokens and final line", async () => {
  const data = new TextEncoder().encode('{"text":"olá"}\n{"done":true}');
  const stream = new ReadableStream({
    start(c) {
      for (const byte of data) c.enqueue(new Uint8Array([byte]));
      c.close();
    },
  });
  const items = [];
  for await (const value of ndjson(stream)) items.push(value);
  assert.deepEqual(items, [{ text: "olá" }, { done: true }]);
});
