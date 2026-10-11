import { mkdir, writeFile } from "node:fs/promises";
import { buildAiSkill } from "../app/lib/ai-documents";

await mkdir("skills/novelai-tags-search", { recursive: true });
await writeFile("skills/novelai-tags-search/SKILL.md", buildAiSkill(""));
console.log("Generated portable NovelAI tag lookup skill without a fixed deployment URL.");
