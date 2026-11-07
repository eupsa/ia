import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  Square,
  Plus,
  MessageSquare,
  PanelLeftClose,
  Menu,
  Cpu,
  Download,
  Check,
  X,
  Trash2,
  FileText,
  Upload,
  Wrench,
  BookOpen,
  ArrowUpRight,
  Sparkles,
  Copy,
  RefreshCw,
  Globe,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@fontsource-variable/figtree";
import "./styles.css";

type Model = {
  id: string;
  name: string;
  size: string;
  description: string;
  installed: boolean;
  download: null | { status: string; progress: number; message: string };
};
type Chat = { id: string; title: string; updated: string };
type Source = { chunk_id: number; name: string; content: string };
type WebSource = { url: string; title: string; snippet: string; published?: string | null };
type Message = {
  role: string;
  content: string;
  sources?: Source[];
  web_sources?: WebSource[];
  model?: string;
  tool?: string;
};
type Document = { id: string; name: string };
async function api(path: string, init?: RequestInit) {
  const response = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Error(body.error || "Não foi possível conectar ao servidor.");
  }
  return response.status === 204 ? null : response.json();
}
const post = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
});
const toolNames: Record<string, string> = {
  calculator: "Calculadora",
  current_time: "Data e hora",
  search_documents: "Busca nos documentos",
  list_documents: "Lista de documentos",
  web_search: "Busca na internet",
};
function Overlay({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const overlay = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    surface.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      const layers = document.querySelectorAll('.overlay');
      if (layers[layers.length - 1] !== overlay.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = [...(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]') || [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div ref={overlay} className={`overlay ${className}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={surface} role="dialog" aria-modal="true" aria-label={title} className="settings-dialog">{children}</div></div>;
}
function SourceList({ label, children, openInitially = false }: { label: string; children: React.ReactNode; openInitially?: boolean }) {
  const [open, setOpen] = useState(openInitially);
  return <section className={`sources ${open ? 'expanded' : ''}`}><button type="button" className="sources-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{label}<ChevronDown size={15}/></button>{open && <div className="sources-content">{children}</div>}</section>;
}
function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(
    localStorage.getItem("model") || "qwen3:0.6b",
  );
  const [chats, setChats] = useState<Chat[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<"models" | "documents" | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rag, setRag] = useState(true);
  const [tools, setTools] = useState(true);
  const [internet, setInternet] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'chat' | 'document'; id: string; name: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const refreshModels = async () => {
    try {
      setModels(await api("/models"));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };
  const refreshChats = async () => setChats(await api("/chats"));
  const refreshDocs = async () => setDocs(await api("/documents"));
  useEffect(() => {
    refreshModels();
    refreshChats().catch((e) => setError(e.message));
    refreshDocs().catch((e) => setError(e.message));
    const interval = setInterval(refreshModels, 2500);
    return () => {
      clearInterval(interval);
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "instant" });
  }, [messages]);
  const selected = models.find((m) => m.id === model);
  const downloading = models.some((m) => m.download?.status === "downloading");
  const chooseModel = (id: string) => {
    setModel(id);
    localStorage.setItem("model", id);
  };
  async function openChat(id: string) {
    if (busy) return;
    try {
      const chat = await api("/chats/" + id);
      setActive(id);
      setMessages(chat.messages);
      setSidebar(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function newChat() {
    if (busy) return;
    setActive(null);
    setMessages([]);
    setDraft("");
    setError("");
    setSidebar(false);
    input.current?.focus();
  }
  async function removeChat(id: string) {
      await api("/chats/" + id, { method: "DELETE" });
      if (active === id) newChat();
      await refreshChats();
  }
  async function deleteSelected() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'chat') await removeChat(confirmDelete.id);
      else { await api('/documents/' + confirmDelete.id, { method: 'DELETE' }); await refreshDocs(); }
      setConfirmDelete(null);
    } catch (e) { setError((e as Error).message); }
  }
  async function send(event?: React.FormEvent, text = draft) {
    event?.preventDefault();
    if (busy || !text.trim()) return;
    if (!selected?.installed) {
      setPanel("models");
      return;
    }
    let id = active;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!id) {
        const chat = await api("/chats", post({}));
        id = chat.id;
        setActive(id);
      }
      setDraft("");
      setMessages((previous) => [
        ...previous,
        { role: "user", content: text.trim() },
        { role: "assistant", content: "", sources: [] },
      ]);
      const response = await fetch(`/api/chats/${id}/messages`, {
        ...post({ content: text, model, rag, tools, internet }),
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const item = JSON.parse(line);
        if (item.error) throw Error(item.error);
        if (item.done) done = true;
        setMessages((previous) =>
          previous.map((message, index) =>
            index === previous.length - 1
              ? {
                  ...message,
                  content: message.content + (item.token || ""),
                  sources: item.sources || message.sources,
                  web_sources: item.web_sources || message.web_sources,
                  tool: item.tool
                    ? toolNames[item.tool] || item.tool
                    : message.tool,
                }
              : message,
          ),
        );
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!done) throw Error("A conexão foi interrompida. Tente novamente.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setDraft(text);
      }
    } finally {
      setBusy(false);
      controller.current = null;
      await refreshChats().catch(() => {});
      // The server persists the answer before closing a completed stream.
      if (id && !abort.signal.aborted) {
        try {
          const chat = await api("/chats/" + id);
          setMessages(chat.messages);
        } catch {}
      }
      refreshModels();
    }
  }
  async function pull(id: string) {
    try {
      setError("");
      await api("/models/pull", post({ model: id }));
      await refreshModels();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (!/\.(txt|md)$/i.test(file.name) || file.size > 800000)
          throw Error(
            "Use arquivos .txt ou .md em UTF-8, com até 200.000 caracteres.",
          );
        const text = await file.text();
        await api("/documents", post({ name: file.name, text }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      await refreshDocs().catch(() => {});
    }
  }
  return (
    <div className="app">
      {sidebar && (
        <button
          className="scrim"
          aria-label="Fechar menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">
            <Sparkles size={21} />
          </span>
          <strong>Local</strong>
          <button
            className="icon-button mobile"
            aria-label="Fechar menu"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={20} />
          </button>
        </div>
        <button className="primary new-chat" onClick={newChat} disabled={busy}>
          <Plus size={18} />
          Nova conversa
        </button>
        <div className="history-label">
          Suas conversas <span>{chats.length}</span>
        </div>
        <nav className="history" aria-label="Histórico de conversas">
          {!chats.length && (
            <p className="empty-history">
              Suas ideias começam aqui.
              <br />
              Inicie a primeira conversa.
            </p>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-link ${active === chat.id ? "active" : ""}`}
            >
              <button onClick={() => openChat(chat.id)} disabled={busy}>
                <MessageSquare size={15} />
                <span>{chat.title}</span>
              </button>
              <button
                className="delete-chat icon-button"
                disabled={busy}
                aria-label={`Excluir ${chat.title}`}
                    onClick={() => setConfirmDelete({ kind: 'chat', id: chat.id, name: chat.title })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setPanel("models");
              setSidebar(false);
            }}
          >
            <Cpu size={18} />
            <span>Meus modelos</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile"
              aria-label="Abrir menu"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <button className="model-switch" onClick={() => setPanel("models")} aria-label="Escolher modelo">
              <Cpu size={18}/><span>{selected?.name || "Qwen3 0.6B"}</span>
              <ChevronDown size={15} className="chevron"/>
            </button>
          </div>
          <button
            className="connection"
            onClick={refreshModels}
            title="Verificar conexão"
          >
            <span className={`status-dot ${online ? "online" : ""}`} />
            {online ? "Conectado" : "Sem conexão"}
            <RefreshCw size={13} />
          </button>
        </header>
        <div className={`conversation ${!messages.length ? "is-empty" : ""}`}>
          {!messages.length ? null : (
            <div className="message-list">
              {messages.map((message, index) => (
                <article key={index} className={`message ${message.role}`}>
                  <div className="message-label">
                    {message.role === "user" ? (
                      "Você"
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Local{" "}
                        <span>
                          {message.model?.replace("qwen3:", "Qwen3 ")}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="message-content">
                    {message.content ? (
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </Markdown>
                    ) : (
                      <span className="waiting">Preparando resposta…</span>
                    )}
                  </div>
                  {message.tool && (
                    <div className="tool-result">
                      <Wrench size={13} />
                      {message.tool} utilizada
                    </div>
                  )}
                  {!!message.sources?.length && (
                    <SourceList label={`${message.sources.length} trecho(s) consultado(s)`}>
                      {message.sources.map((source) => (
                        <div key={source.chunk_id}>
                          <strong>
                            <FileText size={14} />
                            {source.name}
                          </strong>
                          <p>{source.content}</p>
                        </div>
                      ))}
                    </SourceList>
                  )}
                  {!!message.web_sources?.length && (
                    <SourceList label={`${message.web_sources.length} fonte(s) da internet`} openInitially>
                      {message.web_sources.map((source) => (
                        <div key={source.url}>
                          <strong><Globe size={14} /><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a></strong>
                          <p>{source.snippet}</p>
                        </div>
                      ))}
                    </SourceList>
                  )}
                  {message.role === "assistant" && message.content && (
                    <button
                      className="copy-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(message.content);
                          setCopied(index);
                          setTimeout(() => setCopied(null), 1800);
                        } catch {
                          setError(
                            "Não foi possível copiar. Selecione o texto manualmente.",
                          );
                        }
                      }}
                    >
                      {copied === index ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}{" "}
                      {copied === index ? "Copiado" : "Copiar"}
                    </button>
                  )}
                </article>
              ))}
              <div ref={bottom} />
            </div>
          )}
        </div>
        <div className="composer-area">
          {error && (
            <div className="error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Fechar aviso"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <form className="composer" onSubmit={send}>
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="O que vamos explorar hoje?"
              aria-label="Sua mensagem"
              maxLength={8000}
              rows={2}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="composer-controls">
              <div className="feature-toggles">
                <button
                  type="button"
                  aria-label="Adicionar ou gerenciar documentos"
                  title="Adicionar documentos"
                  onClick={() => setPanel("documents")}
                >
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  aria-pressed={rag}
                  onClick={() => setRag(!rag)}
                  className={rag ? "enabled" : ""}
                >
                  <BookOpen size={15} />
                  <span>Documentos</span>
                </button>
                <button
                  type="button"
                  aria-pressed={tools}
                  onClick={() => setTools(!tools)}
                  className={tools ? "enabled" : ""}
                >
                  <Wrench size={15} />
                  <span>Ferramentas</span>
                </button>
                <button type="button" aria-pressed={internet} onClick={() => setInternet(!internet)} className={internet ? "enabled" : ""}>
                  <Globe size={15} /><span>Internet</span>
                </button>
              </div>
              {busy ? (
                <button
                  type="button"
                  className="send"
                  aria-label="Parar resposta"
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={17} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send"
                  aria-label="Enviar mensagem"
                  disabled={!draft.trim() || !online || downloading}
                >
                  <ArrowUp size={21} />
                </button>
              )}
            </div>
          </form>
          <p className="composer-note">
            A IA pode cometer erros. Confira informações importantes.
          </p>
        </div>
      </main>
      {panel && <Overlay title={panel === 'models' ? 'Escolher modelo' : 'Documentos'} onClose={() => setPanel(null)}>
        <div className="dialog-heading">
          <div>
            <h2>
              {panel === "models"
                ? "Escolha um modelo"
                : "Seus documentos"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar painel"
            onClick={() => setPanel(null)}
          >
            <X size={21} />
          </button>
        </div>
        <p className="dialog-intro">
          {panel === "models"
            ? "Escolha um modelo, baixe uma vez e converse direto no seu servidor."
            : "Adicione seus arquivos. A IA encontra trechos relevantes e mostra as fontes nas respostas."}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {panel === "models" ? (
          <>
            <div className="model-cards">
              {(models.length
                ? models
                : [
                    {
                      id: "qwen3:0.6b",
                      name: "Qwen3 0.6B",
                      size: "523 MB",
                      description: "Mais leve, para conversas rápidas.",
                      installed: false,
                      download: null,
                    },
                    {
                      id: "qwen3:1.7b",
                      name: "Qwen3 1.7B",
                      size: "1,4 GB",
                      description:
                        "Mais capacidade para escrever e explorar ideias.",
                      installed: false,
                      download: null,
                    },
                  ]
              ).map((m) => (
                <section
                  key={m.id}
                  className={`model-card ${model === m.id ? "chosen" : ""}`}
                >
                  <div className="model-card-heading">
                    <Cpu size={26} />
                    <span className="tag">{m.size}</span>
                  </div>
                  <h3>{m.name}</h3>
                  <p>{m.description}</p>
                  {m.download?.status === "downloading" ? (
                    <div className="download-status">
                      <div className="progress-track" role="progressbar" aria-label={`Download de ${m.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.download.progress}><span style={{width: `${m.download.progress}%`}} /></div>
                      <span>
                        {m.download.progress}% · {m.download.message}
                      </span>
                    </div>
                  ) : m.installed ? (
                    <button
                      className={model === m.id ? "secondary" : "primary"}
                      disabled={busy}
                      onClick={() => chooseModel(m.id)}
                    >
                      <Check size={16} />
                      {model === m.id ? "Selecionado" : "Usar modelo"}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy || downloading || !online}
                      onClick={() => pull(m.id)}
                    >
                      <Download size={16} />
                      {m.download?.status === "error"
                        ? "Tentar novamente"
                        : "Baixar modelo"}
                    </button>
                  )}
                  {m.download?.status === "error" && (
                    <p role="alert">{m.download.message}</p>
                  )}
                </section>
              ))}
            </div>
            {!online && (
              <p className="error">
                Ollama desconectado. Verifique os serviços Docker e tente
                novamente.
              </p>
            )}
          </>
        ) : (
          <>
            <label className={`upload-zone ${uploading ? "disabled" : ""}`}>
              <Upload size={26} />
              <strong>
                {uploading ? "Adicionando documentos…" : "Adicionar documentos"}
              </strong>
              <span>
                Arquivos .txt ou .md · até 200 mil caracteres por arquivo
              </span>
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="document-list">
              {docs.length ? (
                docs.map((doc) => (
                  <div key={doc.id}>
                    <FileText size={19} />
                    <span>{doc.name}</span>
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${doc.name}`}
                      onClick={async () => {
                        setConfirmDelete({ kind: 'document', id: doc.id, name: doc.name });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p>
                  Nenhum documento ainda. Adicione o primeiro para consultar
                  suas próprias informações.
                </p>
              )}
            </div>
            <div className="panel-note">
              <BookOpen size={18} />
              <span>
                A busca usa palavras-chave nos seus arquivos. Use os termos do
                documento para encontrar melhores resultados.
              </span>
            </div>
          </>
        )}
      </Overlay>}
      {confirmDelete && <Overlay title="Confirmar exclusão" className="confirm-overlay" onClose={() => setConfirmDelete(null)}><div className="confirm-icon"><Trash2 size={21}/></div><h2>Excluir {confirmDelete.kind === 'chat' ? 'conversa' : 'documento'}?</h2><p><strong>{confirmDelete.name}</strong> será excluído permanentemente.</p><div className="confirm-actions"><button className="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</button><button className="danger-button" onClick={deleteSelected}>Excluir</button></div></Overlay>}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
