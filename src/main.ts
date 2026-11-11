import "./style.css";
import { formatReply } from "./format";

type Role = "user" | "assistant";
interface HistoryItem {
  role: Role;
  content: string;
}
interface ChatResponse {
  reply?: string;
  error?: string;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const log = $<HTMLElement>("log");
const form = $<HTMLFormElement>("form");
const input = $<HTMLTextAreaElement>("input");
const send = $<HTMLButtonElement>("send");
const reset = $<HTMLButtonElement>("reset");

let history: HistoryItem[] = [];
let busy = false;

const WELCOME = "Hi! Ask me about any sport — results, fixtures, standings, rules or training.";

function scrollToBottom(): void {
  log.scrollTop = log.scrollHeight;
}

function addMessage(role: Role, text: string): HTMLElement {
  const row = document.createElement("article");
  row.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "who";
  label.textContent = role === "user" ? "You" : "Sports Bot";

  const body = document.createElement("div");
  body.className = "body";
  if (role === "assistant") body.innerHTML = formatReply(text);
  else body.textContent = text;

  row.append(label, body);
  log.appendChild(row);
  scrollToBottom();
  return body;
}

function setBusy(value: boolean): void {
  busy = value;
  send.disabled = value;
  send.textContent = value ? "Sending" : "Send";
}

async function ask(text: string): Promise<void> {
  if (busy) return;
  addMessage("user", text);

  const body = addMessage("assistant", "");
  body.classList.add("pending");
  body.textContent = "Looking that up…";
  setBusy(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok || data.error || !data.reply) {
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }
    body.classList.remove("pending");
    body.innerHTML = formatReply(data.reply);
    history.push({ role: "user", content: text }, { role: "assistant", content: data.reply });
  } catch (e) {
    body.classList.remove("pending");
    body.classList.add("error");
    body.textContent = `Couldn't get an answer. ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    setBusy(false);
    input.focus();
    scrollToBottom();
  }
}

function resizeInput(): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function submit(): void {
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = "";
  resizeInput();
  void ask(text);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});

reset.addEventListener("click", () => {
  if (busy) return;
  history = [];
  log.replaceChildren();
  addMessage("assistant", WELCOME);
  input.value = "";
  resizeInput();
  input.focus();
});

addMessage("assistant", WELCOME);
input.focus();
