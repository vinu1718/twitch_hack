import OpenAI from "openai";

let client: OpenAI | undefined;

export function openai(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return (client ??= new OpenAI({ apiKey, logLevel: "off" }));
}
