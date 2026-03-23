import {
  Client,
  GatewayIntentBits,
  Message,
  TextChannel,
  Partials,
} from "discord.js";
import { logger } from "./lib/logger";

const DISCORD_TOKEN = process.env["DISCORD_TOKEN"];
const DISCORD_CHANNEL_ID = process.env["DISCORD_CHANNEL_ID"];
const KARUTA_BOT_ID = process.env["KARUTA_BOT_ID"] ?? "646937666251915264";

const KD_INTERVAL_MS = 1_860_000;

// Number emojis to react with: position 1, 2 or 3
const POSITION_EMOJIS = ["1️⃣", "2️⃣", "3️⃣"];

// Store the last Karuta drop message so Card Companion response can reference it
let lastKarutaDrop: Message | null = null;
// Timeout to clear the last drop if no CC response arrives
let dropTimeout: ReturnType<typeof setTimeout> | null = null;

function clearDrop() {
  lastKarutaDrop = null;
  if (dropTimeout) {
    clearTimeout(dropTimeout);
    dropTimeout = null;
  }
}

function isKarutaDrop(message: Message): boolean {
  if (message.author.id !== KARUTA_BOT_ID) return false;
  // Karuta drop messages contain an embed with fields and "drop" related content
  if (message.embeds.length === 0) return false;
  const embed = message.embeds[0];
  // Karuta drops typically have a description or title referencing cards
  const content = (embed.description ?? "") + (embed.title ?? "");
  return (
    content.toLowerCase().includes("card") ||
    message.components.length > 0 ||
    embed.fields.length > 0
  );
}

function extractPositionFromCC(message: Message): number | null {
  const fullText =
    (message.content ?? "") +
    message.embeds
      .map((e) => (e.description ?? "") + (e.title ?? "") + e.fields.map((f) => f.name + f.value).join(" "))
      .join(" ");

  const lower = fullText.toLowerCase();

  // Card Companion usually says something like "Card 1 has the most WL"
  // or "#1" or "position 1" or just "1" near "wl" or "wishlist"
  // We look for patterns like "card 1", "#1", "position 1" near wl references
  const patterns = [
    /card\s*[#\-]?\s*([123])\s*(?:has|is|with)?\s*(?:the\s*)?(?:most|highest|more)\s*wl/i,
    /([123])\s*(?:has|is|with)?\s*(?:the\s*)?(?:most|highest|more)\s*wl/i,
    /highest\s*wl[^0-9]*([123])/i,
    /most\s*(?:wl|wishlists?)[^0-9]*([123])/i,
    /#([123])/i,
    /position\s*([123])/i,
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) {
      const pos = parseInt(match[1], 10);
      if (pos >= 1 && pos <= 3) return pos;
    }
  }

  // Fallback: look for standalone 1, 2, or 3 in the context of wl
  if (lower.includes("wl") || lower.includes("wishlist")) {
    for (const pos of [1, 2, 3]) {
      if (lower.includes(String(pos))) return pos;
    }
  }

  return null;
}

function isCardCompanionMessage(message: Message): boolean {
  // Card Companion bot name — adjust if the bot has a different name/ID in your server
  const name = message.author.username.toLowerCase();
  return (
    name.includes("card") &&
    (name.includes("companion") || name.includes("cc"))
  );
}

export function startDiscordBot() {
  if (!DISCORD_TOKEN) {
    logger.warn("DISCORD_TOKEN not set — Discord bot will not start");
    return;
  }
  if (!DISCORD_CHANNEL_ID) {
    logger.warn("DISCORD_CHANNEL_ID not set — Discord bot will not start");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction],
  });

  client.once("ready", () => {
    logger.info({ tag: client.user?.tag }, "Discord bot ready");

    // Send kd immediately, then every KD_INTERVAL_MS
    sendKd();
    setInterval(sendKd, KD_INTERVAL_MS);
  });

  async function sendKd() {
    try {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID!);
      if (!channel || !channel.isTextBased()) {
        logger.error({ channelId: DISCORD_CHANNEL_ID }, "Channel not found or not text-based");
        return;
      }
      await (channel as TextChannel).send("kd");
      logger.info({ channelId: DISCORD_CHANNEL_ID }, "Sent 'kd'");
    } catch (err) {
      logger.error({ err }, "Failed to send 'kd'");
    }
  }

  client.on("messageCreate", async (message) => {
    // Only process messages in the configured channel
    if (message.channelId !== DISCORD_CHANNEL_ID) return;

    // Detect a Karuta card drop
    if (isKarutaDrop(message)) {
      logger.info({ messageId: message.id }, "Detected Karuta card drop");
      clearDrop();
      lastKarutaDrop = message;
      // Give Card Companion 15 seconds to respond
      dropTimeout = setTimeout(() => {
        logger.info("No CC response within 15s — clearing drop");
        clearDrop();
      }, 15_000);
      return;
    }

    // Detect Card Companion response
    if (isCardCompanionMessage(message) && lastKarutaDrop) {
      const position = extractPositionFromCC(message);
      if (position !== null) {
        const emoji = POSITION_EMOJIS[position - 1];
        logger.info({ position, emoji }, "CC indicated best card position — reacting");
        try {
          await lastKarutaDrop.react(emoji);
          logger.info({ emoji }, "Reacted to Karuta drop");
        } catch (err) {
          logger.error({ err }, "Failed to react to Karuta drop");
        }
        clearDrop();
      } else {
        logger.warn({ content: message.content }, "Could not parse position from Card Companion message");
      }
    }
  });

  client.login(DISCORD_TOKEN).catch((err) => {
    logger.error({ err }, "Failed to login to Discord");
  });
}
