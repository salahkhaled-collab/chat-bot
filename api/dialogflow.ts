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

function bookClass(params: Params): Reply {
  const wanted = text(params, "class_type").toLowerCase();
  const name = text(params, "name") || "there";
  const phone = text(params, "phone");
  const date = text(params, "date");
  const cls = gym.classes.find((c) => c.name.toLowerCase() === wanted);

  if (!cls) {
    return { text: `Sorry, we don't run ${wanted || "that class"}. We have ${gym.classes.map((c) => c.name).join(", ")}.` };
  }
  if (!date || Number.isNaN(Date.parse(date))) {
    return { text: `Which day would you like to come? ${cls.name} runs ${cls.schedule}.` };
  }

  const day = weekdayOf(date);
  if (!cls.schedule.includes(day)) {
    const days = WEEKDAYS.filter((d) => cls.schedule.includes(d));
    return {
      text: `${cls.name} doesn't run on ${day}. It's on ${cls.schedule}. Pick one of those days:`,
      rich: [[{ type: "chips", options: days.map((d) => ({ text: `Book ${cls.name} on ${d}` })) }]],
    };
  }

  const ref = `PG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const time = cls.schedule.split(",").pop()?.trim() ?? "";
  const when = `${prettyDate(date)}${time ? ` at ${time}` : ""}`;
  const summary = `You're booked, ${name}! ${cls.name} with ${cls.coach} on ${when}. Booking reference: ${ref}. We'll confirm by SMS on ${phone || "your number"}. Please arrive 10 minutes early.`;
  return {
    text: summary,
    intro: `You're booked, ${name}!`,
    rich: [
      [
        {
          type: "description",
          title: `✓ ${cls.name} booked`,
          text: [when, `Coach: ${cls.coach.replace(/^Coach /, "")}`, `Reference: ${ref}`, `SMS confirmation to ${phone || "your number"}`, "Please arrive 10 minutes early."],
        },
      ],
      [{ type: "chips", options: [{ text: "Make me a workout plan" }, { text: "Opening hours" }] }],
    ],
  };
}

interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

interface PlanDay {
  title: string;
  exercises: Exercise[];
}

interface Plan {
  days: PlanDay[];
  tip: string;
}

interface Reply {
  text: string;
  intro?: string;
  rich?: unknown[][];
}

const SPLITS: Record<number, [string, string[]][]> = {
  2: [
    ["Full body A", ["Goblet squat", "Push-ups", "Dumbbell row", "Plank"]],
    ["Full body B", ["Romanian deadlift", "Dumbbell shoulder press", "Lat pulldown", "Glute bridge"]],
  ],
  3: [
    ["Upper body", ["Bench press", "Lat pulldown", "Dumbbell shoulder press", "Seated cable row"]],
    ["Lower body", ["Barbell squat", "Romanian deadlift", "Walking lunges", "Calf raises"]],
    ["Full body + core", ["Deadlift", "Push-ups", "Dumbbell row", "Plank"]],
  ],
  4: [
    ["Upper body", ["Bench press", "Lat pulldown", "Dumbbell shoulder press", "Seated cable row"]],
    ["Lower body", ["Barbell squat", "Romanian deadlift", "Leg press", "Calf raises"]],
    ["Push + core", ["Incline dumbbell press", "Lateral raises", "Triceps pushdown", "Plank"]],
    ["Pull + legs", ["Deadlift", "Assisted pull-ups", "Leg curl", "Bicep curl"]],
  ],
  5: [
    ["Chest + triceps", ["Bench press", "Incline dumbbell press", "Chest fly", "Triceps pushdown"]],
    ["Back + biceps", ["Deadlift", "Lat pulldown", "Seated cable row", "Bicep curl"]],
    ["Legs", ["Barbell squat", "Leg press", "Romanian deadlift", "Calf raises"]],
    ["Shoulders + core", ["Overhead press", "Lateral raises", "Face pulls", "Plank"]],
    ["Full body conditioning", ["Kettlebell swings", "Push-ups", "Walking lunges", "Mountain climbers"]],
  ],
};

function templatePlan(goal: string, days: number): Plan {
  const [sets, reps] = goal.includes("strong")
    ? [4, "5"]
    : goal.includes("lose")
      ? [3, "12-15"]
      : goal.includes("muscle")
        ? [3, "8-12"]
        : [3, "10"];
  const split = SPLITS[Math.min(Math.max(days, 2), 5)];
  return {
    days: split.map(([title, names]) => ({
      title,
      exercises: names.map((name) => ({ name, sets: name === "Plank" ? 3 : sets, reps: name === "Plank" ? "30-45 sec" : reps })),
    })),
    tip: goal.includes("lose")
      ? "Finish each session with 20 minutes of cardio, and ask a coach to check your form in the first week."
      : "Warm up for 10 minutes, add weight slowly, and ask a coach to check your form in the first week.",
  };
}

function parsePlan(raw: string): Plan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Partial<Plan>;
    const days = (data.days ?? [])
      .map((d) => ({
        title: String(d?.title ?? "").trim(),
        exercises: (d?.exercises ?? [])
          .filter((e) => e && typeof e.name === "string" && e.name.trim())
          .map((e) => ({ name: e.name.trim(), sets: Number(e.sets) || 3, reps: String(e.reps ?? "10") })),
      }))
      .filter((d) => d.title && d.exercises.length);
    return days.length ? { days, tip: String(data.tip ?? "").trim() } : null;
  } catch {
    return null;
  }
}

function videoLink(exercise: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise} proper form`)}`;
}

function planReply(plan: Plan, goal: string): Reply {
  const lines = plan.days.map(
    (d, i) => `Day ${i + 1} – ${d.title}\n${d.exercises.map((e) => `• ${e.name}: ${e.sets} × ${e.reps}`).join("\n")}`
  );
  const intro = `Your ${plan.days.length}-day plan to ${goal}. Tap ▶ under each day to see how an exercise is done.`;
  const rich: unknown[][] = [
    [{ type: "description", title: "Your workout plan", text: [`Goal: ${goal}`, `${plan.days.length} days a week`] }],
    ...plan.days.map((d, i) => [
      {
        type: "description",
        title: `Day ${i + 1} · ${d.title}`,
        text: d.exercises.map((e) => `${e.name} — ${e.sets} × ${e.reps}`),
      },
      {
        type: "chips",
        options: d.exercises.map((e) => ({ text: `▶ ${e.name}`, link: videoLink(e.name) })),
      },
    ]),
  ];
  if (plan.tip) rich.push([{ type: "description", title: "Coach's tip", text: [plan.tip] }]);
  rich.push([{ type: "chips", options: [{ text: "Book a class" }, { text: "Membership prices" }] }]);
  return { text: [intro, ...lines, plan.tip].filter(Boolean).join("\n\n"), intro, rich };
}

async function workoutPlan(params: Params): Promise<Reply> {
  const goal = text(params, "goal") || "general fitness";
  const level = text(params, "level") || "beginner";
  const days = Math.min(Math.max(Number(text(params, "days")) || 3, 1), 6);
  try {
    const { text: raw, truncated } = await ask({
      system: `You are the personal-training assistant at ${gym.name}. You reply with JSON only, no other text.`,
      question: [
        `Make a weekly gym plan. Goal: ${goal}. Level: ${level}. Training days per week: ${days}.`,
        "Use 4 or 5 common gym exercises per day with standard English names.",
        'Return exactly this JSON shape: {"days":[{"title":"Upper body","exercises":[{"name":"Bench press","sets":3,"reps":"8-10"}]}],"tip":"one short sentence"}',
      ].join("\n"),
      maxTokens: 1500,
      timeoutMs: TIME_BUDGET_MS,
    });
    const plan = truncated ? null : parsePlan(raw);
    if (plan) return planReply(plan, goal);
  } catch (e) {
    console.error(e);
  }
  return planReply(templatePlan(goal, days), goal);
}

function wholeSentences(text: string): string {
  const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf("! "), text.lastIndexOf("? "));
  return end > 0 ? text.slice(0, end + 1) : "";
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
    const { text, truncated } = await ask({ system, question, useTools: true, maxTokens: 1200, timeoutMs: TIME_BUDGET_MS });
    const reply = truncated ? wholeSentences(text) : text;
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

  let reply: Reply;
  if (intent === "Book Class") reply = bookClass(params);
  else if (intent === "Workout Plan") reply = await workoutPlan(params);
  else reply = { text: await fallback(question) };

  return res.status(200).json({
    fulfillmentText: reply.text,
    fulfillmentMessages: [
      { text: { text: [reply.rich ? reply.intro ?? reply.text : reply.text] } },
      ...(reply.rich ? [{ payload: { richContent: reply.rich } }] : []),
    ],
  });
}
