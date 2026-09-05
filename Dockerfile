# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@10.15.1

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY tsconfig.json eslint.config.js ./
COPY src ./src

RUN pnpm build

FROM node:22-slim AS runtime

ENV NODE_ENV="production"
ENV PORT="4111"
ENV MASTRA_STUDIO_PATH=".mastra/output/studio"

WORKDIR /app

COPY --from=build --chown=node:node /app/.mastra/output ./.mastra/output

USER node

EXPOSE 4111

CMD ["node", ".mastra/output/index.mjs"]