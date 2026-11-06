# EasAlpha web: admin panel, POS, kitchen display, rider app, storefront (Next.js 15).
# Build: docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.pk/api/v1 -t easalpha-web easalpha-web
FROM node:20-slim AS build
RUN npm install -g pnpm@10.27.0 --no-audit --no-fund
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ARG NEXT_PUBLIC_CABLE_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_CABLE_URL=$NEXT_PUBLIC_CABLE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:20-slim
RUN npm install -g pnpm@10.27.0 --no-audit --no-fund
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Served as the image's node user (uid 1000), not root; .next is owned by it for the ISR cache (6 Nov 2026 review, A14).
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000"]
