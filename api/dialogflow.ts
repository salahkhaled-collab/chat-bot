import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ask } from "./_lib/assistant";
import { gym, gymFacts } from "./_lib/gym";

const TIME_BUDGET_MS = 4300;
const TIMEZONE = "Africa/Cairo";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Params = Record<string, unknown>;

interface DialogflowRequest {
  session?: string;
  queryResult?: {
    queryText?: string;
    parameters?: Params;
    intent?: { displayName?: string };
  };
}

function text(params: Params, key: string): string {
  const v = params[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name).trim();
  return "";
}

function weekdayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: TIMEZONE }).format(new Date(iso));
}

function prettyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIMEZONE,
  }).format(new Date(iso));
}

function bookClass(params: Params): string {
  const wanted = text(params, "class_type").toLowerCase();
  const name = text(params, "name") || "there";
  const phone = text(params, "phone");
  const date = text(params, "date");
  const cls = gym.classes.find((c) => c.name.toLowerCase() === wanted);

  if (!cls) {
    return `Sorry, we don't run ${wanted || "that class"}. We have ${gym.classes.map((c) => c.name).join(", ")}.`;
  }
  if (!date || Number.isNaN(Date.parse(date))) {
    return `Which day would you like to come? ${cls.name} runs ${cls.schedule}.`;
  }

  const day = weekdayOf(date);
  if (!cls.schedule.includes(day)) {
    return `${cls.name} doesn't run on ${day}. It's on ${cls.schedule}. Say "book ${cls.name}" again with one of those days.`;
  }

  const ref = `PG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const time = cls.schedule.split(",").pop()?.trim() ?? "";
  return [
    `You're booked, ${name}!`,
    `${cls.name} with ${cls.coach} on ${prettyDate(date)}${time ? ` at ${time}` : ""}.`,
    `Booking reference: ${ref}. We'll confirm by SMS on ${phone || "your number"}.`,
    `Please arrive 10 minutes early.`,
  ].join(" ");
}

function templatePlan(goal: string, level: string, days: number): string {
  const splits: Record<number, string[]> = {
    2: ["Full body A", "Full body B"],
    3: ["Upper body", "Lower body", "Full body + core"],
    4: ["Upper body", "Lower body", "Push + core", "Pull + legs"],
    5: ["Chest + triceps", "Back + biceps", "Legs", "Shoulders + core", "Full body conditioning"],
  };
  const plan = splits[Math.min(Math.max(days, 2), 5)];
  const cardio = goal.includes("lose") ? "Finish each session with 20 minutes of cardio." : "Add 10 minutes of light cardio to warm up.";
  return [
    `Here's a ${plan.length}-day ${level} plan (goal: ${goal}):`,
    ...plan.map((p, i) => `Day ${i + 1}: ${p}, 3–4 sets of 8–12 reps per exercise.`),
    cardio,
    "Ask a coach at reception to check your form in the first week.",
  ].join("\n");
}

async function workoutPlan(params: Params): Promise<string> {
  const goal = text(params, "goal") || "general fitness";
  const level = text(params, "level") || "beginner";
  const days = Number(text(params, "days")) || 3;
  try {
    const reply = await ask({
      system: `You are the personal-training assistant at ${gym.name}. Write short, safe, practical gym plans as plain text, no markdown tables. Max 12 lines.`,
      question: `Make a weekly gym plan. Goal: ${goal}. Level: ${level}. Days per week: ${days}. One line per training day listing 3–5 exercises with sets x reps, then one line of advice.`,
      maxTokens: 350,
      timeoutMs: TIME_BUDGET_MS,
    });
    return reply || templatePlan(goal, level, days);
  } catch {
    return templatePlan(goal, level, days);
  }
}

async function fallback(question: string): Promise<string> {
  const system = [
    `You are the customer assistant for ${gym.name}. Today is ${new Date().toISOString().slice(0, 10)}.`,
    "Use these facts for anything about the gym and never invent other prices or times:",
    gymFacts(),
    "You can also answer general fitness, nutrition and sports questions. For live scores or fixtures, use the tools.",
    "Never invent scores. Reply in at most 4 short sentences, plain text, no markdown.",
  ].join("\n");
  try {
    const reply = await ask({ system, question, useTools: true, maxTokens: 250, timeoutMs: TIME_BUDGET_MS });
    if (reply) return reply;
  } catch (e) {
    console.error(e);
  }
  return "Sorry, I didn't catch that. I can help with memberships, classes, opening hours, booking a class or a workout plan.";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const secret = process.env.DIALOGFLOW_WEBHOOK_SECRET;
  if (secret && req.headers["x-webhook-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body ?? {}) as DialogflowRequest;
  const intent = body.queryResult?.intent?.displayName ?? "";
  const params = body.queryResult?.parameters ?? {};
  const question = body.queryResult?.queryText ?? "";

  let reply: string;
  if (intent === "Book Class") reply = bookClass(params);
  else if (intent === "Workout Plan") reply = await workoutPlan(params);
  else reply = await fallback(question);

  return res.status(200).json({ fulfillmentText: reply });
}
