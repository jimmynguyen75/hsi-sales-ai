FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npx tsx src/index.ts"]
