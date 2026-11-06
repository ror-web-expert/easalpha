# EasAlpha WhatsApp gateway (link a phone by QR). Sessions persist in /app/sessions; mount it as a volume.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
# Runs as the image's node user (uid and gid 1000), not root (6 Nov 2026 review, A14). A wasessions volume an older
# root image made is owned by root; deploy/docker-compose.yml's volume-owner service chowns it before this image starts.
RUN mkdir -p sessions && chown -R node:node /app
USER node
EXPOSE 3010
CMD ["node", "server.js"]
