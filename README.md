# Karuta Discord Bot

Bot de Discord que:
1. Envía `kd` en el canal configurado cada 31 minutos (1860 segundos)
2. Detecta cuando Karuta tira cartas
3. Lee la respuesta de Card Companion para saber cuál carta tiene más WL
4. Reacciona con el emoji de posición correspondiente (1️⃣, 2️⃣ o 3️⃣) para agarrar la carta más valiosa

## Configuración

Variables de entorno necesarias:

| Variable | Descripción |
|----------|-------------|
| `DISCORD_TOKEN` | Token de tu bot de Discord |
| `DISCORD_CHANNEL_ID` | ID del canal donde se usará el bot |
| `KARUTA_BOT_ID` | ID del bot Karuta (default: `646937666251915264`) |
| `PORT` | Puerto del servidor (lo asigna Replit automáticamente) |

## Cómo obtener el token del bot

1. Ve a https://discord.com/developers/applications
2. Crea una nueva aplicación
3. Ve a la sección **Bot** → **Reset Token**
4. Habilita los intents: **Message Content Intent**, **Server Members Intent**, **Presence Intent**
5. Invita el bot a tu servidor con permisos para leer mensajes, enviar mensajes y añadir reacciones

## Uso

El bot se inicia automáticamente con el servidor. No requiere comandos manuales.
