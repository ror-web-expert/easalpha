# Servio WhatsApp gateway (link a phone by QR). Sessions persist in /app/sessions; mount it as a volume.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
RUN mkdir -p sessions
EXPOSE 3010
CMD ["node", "server.js"]
