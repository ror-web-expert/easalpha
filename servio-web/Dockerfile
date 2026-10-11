# Servio web: admin panel, POS, kitchen display, rider app, storefront (Next.js 15).
# Build: docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.pk/api/v1 -t servio-web servio-web
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ARG NEXT_PUBLIC_CABLE_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_CABLE_URL=$NEXT_PUBLIC_CABLE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:20-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000"]
