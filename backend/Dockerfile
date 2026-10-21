FROM oven/bun:1.4.3-alpine

WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000
USER bun
CMD ["bun", "src/index.ts"]
