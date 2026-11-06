# EasAlpha WhatsApp gateway (link a phone by QR). Sessions persist in /app/sessions; mount it as a volume.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
# Runs as the image's node user (uid 1000), not root. An existing wasessions volume on a server was made by root;
# chown it once before this image starts (6 Nov 2026 review, A14).
RUN mkdir -p sessions && chown -R node:node /app
USER node
EXPOSE 3010
CMD ["node", "server.js"]
