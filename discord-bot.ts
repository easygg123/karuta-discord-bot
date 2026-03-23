import { logger } from "./lib/logger";
import Tesseract from "tesseract.js";

const TOKEN = process.env["DISCORD_TOKEN"];
const CHANNEL_ID = process.env["DISCORD_CHANNEL_ID"];
const KARUTA_ID = process.env["KARUTA_BOT_ID"] ?? "646988964364451840";

const BASE_URL = "https://discord.com/api/v9";

const EMOJIS_URL: Record<string, string> = {
  "1": "1%EF%B8%8F%E2%83%A3",
  "2": "2%EF%B8%8F%E2%83%A3",
  "3": "3%EF%B8%8F%E2%83%A3",
  "4": "4%EF%B8%8F%E2%83%A3",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function discordHeaders() {
  return {
    Authorization: TOKEN!,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
  };
}

async function sendMessage(content: string) {
  const res = await fetch(`${BASE_URL}/channels/${CHANNEL_ID}/messages`, {
    method: "POST",
    headers: discordHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Error sending message");
  }
}

interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string };
  attachments: { url: string }[];
  embeds: { description?: string; title?: string; fields?: { name: string; value: string }[] }[];
}

async function getRecentMessages(limit = 5): Promise<DiscordMessage[]> {
  const res = await fetch(
    `${BASE_URL}/channels/${CHANNEL_ID}/messages?limit=${limit}`,
    { headers: discordHeaders() }
  );
  if (!res.ok) return [];
  return res.json() as Promise<DiscordMessage[]>;
}

async function reactToMessage(messageId: string, position: string) {
  const emoji = EMOJIS_URL[position];
  if (!emoji) return;
  const url = `${BASE_URL}/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${emoji}/@me`;
  const res = await fetch(url, {
    method: "PUT",
    headers: discordHeaders(),
  });
  if (res.status === 204 || res.status === 201) {
    logger.info({ position }, `✅ Reacción enviada a carta ${position}`);
  } else {
    logger.warn({ status: res.status }, "❌ Error al reaccionar");
  }
}

async function runOCR(imageUrl: string): Promise<string> {
  try {
    const { data } = await Tesseract.recognize(imageUrl, "eng", {
      logger: () => {},
    });
    return data.text;
  } catch (err) {
    logger.warn({ err }, "⚠️ Error en OCR");
    return "";
  }
}

function extractPositionFromCC(messages: DiscordMessage[]): string {
  for (const msg of messages) {
    const name = msg.author.username.toLowerCase();
    if (!name.includes("card") && !name.includes("companion") && !name.includes("cc")) continue;

    const fullText =
      msg.content +
      msg.embeds
        .map((e) =>
          (e.description ?? "") +
          (e.title ?? "") +
          (e.fields ?? []).map((f) => f.name + " " + f.value).join(" ")
        )
        .join(" ");

    const patterns = [
      /card\s*[#\-]?\s*([123])\s*(?:has|is|with)?\s*(?:the\s*)?(?:most|highest|more)\s*wl/i,
      /([123])\s*(?:has|is|with)?\s*(?:the\s*)?(?:most|highest|more)\s*wl/i,
      /highest\s*wl[^0-9]*([123])/i,
      /most\s*(?:wl|wishlists?)[^0-9]*([123])/i,
    ];

    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) return match[1];
    }
  }
  return "";
}

async function runCycle() {
  logger.info(`[${new Date().toLocaleTimeString()}] --- Enviando kd ---`);
  await sendMessage("kd");

  let dropId: string | null = null;
  let imageUrl: string | null = null;

  // Esperar el mensaje de Karuta con la imagen (hasta 24 segundos)
  for (let i = 0; i < 6; i++) {
    await sleep(4000);
    const messages = await getRecentMessages(5);
    for (const msg of messages) {
      if (
        msg.author.id === KARUTA_ID &&
        msg.content.toLowerCase().includes("dropping") &&
        msg.attachments.length > 0
      ) {
        dropId = msg.id;
        imageUrl = msg.attachments[0].url;
        break;
      }
    }
    if (dropId) break;
  }

  if (!dropId || !imageUrl) {
    logger.warn("❌ No se encontró el drop de Karuta.");
    return;
  }

  logger.info({ dropId }, `📸 Drop detectado. Procesando imagen...`);

  // OCR de la imagen
  const ocrText = await runOCR(imageUrl);
  if (ocrText) {
    logger.info(`🔍 OCR leyó: ${ocrText.slice(0, 80).replace(/\n/g, " ")}...`);
  }

  // Esperar respuesta de Card Companion (hasta 10 segundos)
  let targetPosition = "";
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    const messages = await getRecentMessages(8);
    targetPosition = extractPositionFromCC(messages);
    if (targetPosition) break;
  }

  if (!targetPosition) {
    logger.info("ℹ️ Card Companion no respondió, reaccionando a carta 1 por defecto");
    targetPosition = "1";
  }

  await reactToMessage(dropId, targetPosition);
}

export function startDiscordBot() {
  if (!TOKEN) {
    logger.warn("DISCORD_TOKEN no configurado — bot de Discord no iniciará");
    return;
  }
  if (!CHANNEL_ID) {
    logger.warn("DISCORD_CHANNEL_ID no configurado — bot de Discord no iniciará");
    return;
  }

  logger.info("🤖 Bot de Discord iniciado (modo polling)");

  async function loop() {
    while (true) {
      try {
        await runCycle();
      } catch (err) {
        logger.error({ err }, "🔴 Error en el ciclo del bot");
      }

      // 1860 segundos + random entre 10 y 45 para evitar detección
      const jitter = Math.floor(Math.random() * 36) + 10;
      const wait = (1860 + jitter) * 1000;
      logger.info(`⏳ Próximo kd en ${1860 + jitter} segundos`);
      await sleep(wait);
    }
  }

  loop();
}
