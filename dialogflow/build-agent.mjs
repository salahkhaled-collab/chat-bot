import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gym = JSON.parse(readFileSync(join(here, "../data/gym.json"), "utf8"));
const out = join(here, "agent");
const zipPath = join(here, "PulseGym-agent.zip");
const money = (n) => `${n.toLocaleString("en-US")} ${gym.currency}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "intents"), { recursive: true });
mkdirSync(join(out, "entities"), { recursive: true });
const write = (file, data) => writeFileSync(join(out, file), JSON.stringify(data, null, 2));

write("package.json", { version: "1.0.0" });
write("agent.json", {
  description: `Customer assistant for ${gym.name}: memberships, classes, bookings and workout plans.`,
  language: "en",
  shortDescription: "",
  examples: "",
  linkToDocs: "",
  displayName: gym.name.replace(/\s+/g, ""),
  disableInteractionLogs: false,
  disableStackdriverLogs: true,
  defaultTimezone: "Africa/Cairo",
  isPrivate: true,
  mlMinConfidence: 0.3,
  supportedLanguages: [],
  enableOnePlatformApi: true,
  onePlatformApiVersion: "v2",
  analyzeQueryTextSentiment: false,
  enabledKnowledgeBaseNames: [],
  knowledgeServiceConfidenceAdjustment: 0,
  dialogBuilderMode: false,
  baseActionPackagesUrl: "",
  enableSpellCorrection: true,
});

function entity(name, entries) {
  write(`entities/${name}.json`, {
    id: randomUUID(),
    name,
    isOverridable: true,
    isEnum: false,
    isRegexp: false,
    automatedExpansion: false,
    allowFuzzyExtraction: true,
  });
  write(`entities/${name}_entries_en.json`, entries.map(([value, ...synonyms]) => ({ value, synonyms: [value, ...synonyms] })));
}

entity("class_type", gym.classes.map((c) => {
  const extra = { Spinning: ["spin", "cycling", "indoor cycling"], CrossFit: ["crossfit", "cross fit"], Boxing: ["kickboxing"], Yoga: ["yoga class"], Zumba: ["dance", "dance class"] };
  return [c.name, ...(extra[c.name] ?? [])];
}));
entity("goal", [
  ["lose weight", "weight loss", "fat loss", "burn fat", "slim down", "cut"],
  ["build muscle", "muscle gain", "bulk", "get bigger", "hypertrophy"],
  ["get stronger", "strength", "power"],
  ["general fitness", "stay fit", "be healthy", "tone up", "endurance"],
]);
entity("level", [
  ["beginner", "new", "never trained", "starting out", "newbie"],
  ["intermediate", "some experience", "average"],
  ["advanced", "experienced", "pro"],
]);

function phrase(text) {
  const parts = [];
  const re = /\[([^\]|]+)\|(@[\w.-]+):(\w+)\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), userDefined: false });
    parts.push({ text: m[1], alias: m[3], meta: m[2], userDefined: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), userDefined: false });
  return { id: randomUUID(), data: parts, isTemplate: false, count: 0, lang: "en", updated: 0 };
}

function intent(name, { phrases = [], replies = [], params = [], webhook = false, events = [], fallback = false, action = "", priority = 500000 }) {
  write(`intents/${name}.json`, {
    id: randomUUID(),
    name,
    auto: true,
    contexts: [],
    responses: [{
      resetContexts: false,
      action,
      affectedContexts: [],
      parameters: params.map((p) => ({
        id: randomUUID(),
        name: p.name,
        required: true,
        dataType: p.type,
        value: `$${p.name}`,
        defaultValue: "",
        isList: false,
        prompts: p.prompts.map((value) => ({ lang: "en", value })),
        promptMessages: [],
        noMatchPromptMessages: [],
        noInputPromptMessages: [],
        outputDialogContexts: [],
      })),
      messages: replies.length ? [{ type: "0", title: "", textToSpeech: "", lang: "en", speech: replies, condition: "" }] : [],
      speech: [],
    }],
    priority,
    webhookUsed: webhook,
    webhookForSlotFilling: false,
    fallbackIntent: fallback,
    events: events.map((e) => ({ name: e })),
    conditionalResponses: [],
    condition: "",
    conditionalFollowupEvents: [],
  });
  if (phrases.length) write(`intents/${name}_usersays_en.json`, phrases.map(phrase));
}

const hours = gym.hours.map((h) => `${h.days}: ${h.open} to ${h.close}`).join(". ");
const plans = gym.plans.map((p) => `${p.name}: ${money(p.price)} per ${p.period}`).join(". ");
const classes = gym.classes.map((c) => `${c.name} (${c.schedule})`).join(", ");
const trainers = gym.trainers.map((t) => `${t.name} – ${t.focus}`).join(", ");

intent("Default Welcome Intent", {
  events: ["WELCOME"],
  action: "input.welcome",
  phrases: ["hi", "hello", "hey", "good morning", "good evening", "salam", "hey there"],
  replies: [`Hi! I'm the ${gym.name} assistant. I can tell you about memberships, classes and opening hours, book you a class, or build you a workout plan. What do you need?`],
});

intent("Default Fallback Intent", {
  fallback: true,
  webhook: true,
  action: "input.unknown",
  replies: ["Sorry, I didn't get that. Try asking about memberships, classes, hours, booking or a workout plan."],
});

intent("Membership Plans", {
  phrases: ["how much is the membership", "what are your prices", "membership plans", "how much does it cost", "price list", "do you have a student discount", "annual membership price", "how much per month", "subscription prices"],
  replies: [`Our plans: ${plans}. Which one suits you?`],
});

intent("Opening Hours", {
  phrases: ["what time do you open", "opening hours", "when do you close", "are you open on friday", "working hours", "what are your hours", "are you open now"],
  replies: [`We're open ${hours}.`],
});

intent("Location", {
  phrases: ["where are you", "where is the gym", "address", "location", "how do I get there", "what's your phone number", "contact"],
  replies: [`${gym.name} is at ${gym.address}. Call us on ${gym.phone}.`],
});

intent("Class Schedule", {
  phrases: ["what classes do you have", "class schedule", "when is yoga", "do you have crossfit", "group classes", "when is boxing", "spinning times", "zumba schedule"],
  replies: [`Our classes: ${classes}. Want me to book one for you?`],
});

intent("Trainers", {
  phrases: ["who are the trainers", "personal trainer", "how much is personal training", "do you have coaches", "PT price", "I want a personal coach"],
  replies: [`Our coaches: ${trainers}. ${gym.personalTraining}`],
});

intent("Free Trial", {
  phrases: ["can I try the gym", "free trial", "day pass", "can I visit first", "do you have a trial"],
  replies: [`${gym.trial} Just say "book a class" or visit reception.`],
});

intent("Freeze Membership", {
  phrases: ["freeze my membership", "I'm traveling can I pause", "pause membership", "cancel my membership", "hold my subscription"],
  replies: [gym.freeze],
});

intent("Book Class", {
  webhook: true,
  phrases: [
    "book a class",
    "I want to book a class",
    "book [yoga|@class_type:class_type]",
    "I want to join [CrossFit|@class_type:class_type] on [Monday|@sys.date:date]",
    "reserve a spot in [spinning|@class_type:class_type]",
    "sign me up for [boxing|@class_type:class_type] [tomorrow|@sys.date:date]",
    "can I book [zumba|@class_type:class_type] on [Saturday|@sys.date:date]",
    "book a free trial",
  ],
  params: [
    { name: "class_type", type: "@class_type", prompts: [`Which class? We have ${gym.classes.map((c) => c.name).join(", ")}.`] },
    { name: "date", type: "@sys.date", prompts: ["Which day would you like to come?"] },
    { name: "name", type: "@sys.person", prompts: ["What's your name?"] },
    { name: "phone", type: "@sys.phone-number", prompts: ["And your phone number, so we can confirm?"] },
  ],
  replies: ["Booking you in…"],
});

intent("Workout Plan", {
  webhook: true,
  phrases: [
    "make me a workout plan",
    "I need a training program",
    "give me a gym plan",
    "I want to [lose weight|@goal:goal]",
    "workout plan to [build muscle|@goal:goal]",
    "I'm a [beginner|@level:level] and want to [get stronger|@goal:goal]",
    "plan for [4|@sys.number-integer:days] days a week",
    "what should I do at the gym",
  ],
  params: [
    { name: "goal", type: "@goal", prompts: ["What's your goal: lose weight, build muscle, get stronger or general fitness?"] },
    { name: "level", type: "@level", prompts: ["Are you a beginner, intermediate or advanced?"] },
    { name: "days", type: "@sys.number-integer", prompts: ["How many days a week can you train?"] },
  ],
  replies: ["Building your plan…"],
});

intent("Thanks", {
  phrases: ["thanks", "thank you", "great thanks", "appreciate it", "shukran"],
  replies: ["You're welcome! See you at the gym."],
});

intent("Goodbye", {
  phrases: ["bye", "goodbye", "see you", "that's all"],
  replies: ["Bye! Have a great workout."],
});

rmSync(zipPath, { force: true });
execFileSync("zip", ["-qr", zipPath, "."], { cwd: out });
console.log(`Wrote ${zipPath}`);
