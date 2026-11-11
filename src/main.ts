import "./style.css";
import gym from "../data/gym.json";

const MESSENGER_SCRIPT = "https://www.gstatic.com/dialogflow-console/fast/messenger/bootstrap.js?v=1";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setText(id: string, value: string): void {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function money(n: number): string {
  return `${n.toLocaleString("en-US")} ${gym.currency}`;
}

function renderPage(): void {
  document.title = gym.name;
  setText("gym-name", gym.name);
  setText("footer-name", gym.name);
  setText("gym-city", gym.city);
  setText("gym-tagline", gym.tagline);
  setText("gym-address", gym.address);
  setText("gym-phone", gym.phone);

  const plans = document.getElementById("plan-list");
  for (const plan of gym.plans) {
    const card = el("article", "plan");
    card.append(el("h3", undefined, plan.name));
    const price = el("p", "price", money(plan.price));
    price.append(el("span", undefined, ` / ${plan.period}`));
    card.append(price);
    const perks = el("ul");
    for (const perk of plan.perks) perks.append(el("li", undefined, perk));
    card.append(perks);
    plans?.append(card);
  }

  const classes = document.getElementById("class-list");
  for (const c of gym.classes) {
    const row = el("tr");
    row.append(el("td", undefined, c.name), el("td", undefined, c.schedule), el("td", undefined, c.coach));
    classes?.append(row);
  }

  const hours = document.getElementById("hours-list");
  for (const h of gym.hours) {
    const item = el("li");
    item.append(el("span", undefined, h.days), el("strong", undefined, `${h.open} – ${h.close}`));
    hours?.append(item);
  }
}

function mountAssistant(): void {
  const agentId = import.meta.env.VITE_DIALOGFLOW_AGENT_ID as string | undefined;
  if (!agentId) {
    const note = el("div", "setup-note", "Assistant not connected yet: set VITE_DIALOGFLOW_AGENT_ID in Vercel and redeploy.");
    document.body.append(note);
    return;
  }

  const script = document.createElement("script");
  script.src = MESSENGER_SCRIPT;
  document.head.append(script);

  const messenger = document.createElement("df-messenger");
  messenger.setAttribute("intent", "WELCOME");
  messenger.setAttribute("chat-title", `${gym.name} Assistant`);
  messenger.setAttribute("agent-id", agentId);
  messenger.setAttribute("language-code", "en");
  const setOpen = (event: Event) => {
    const detail = (event as CustomEvent<{ isOpen?: boolean }>).detail;
    document.body.classList.toggle("chat-open", Boolean(detail?.isOpen));
  };
  messenger.addEventListener("df-chat-open-changed", setOpen);
  window.addEventListener("df-chat-open-changed", setOpen);
  document.body.append(messenger);
}

renderPage();
mountAssistant();
