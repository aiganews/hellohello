FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN npm prune --production

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app ./

EXPOSE 8080
CMD ["node", "src/index.js"]
