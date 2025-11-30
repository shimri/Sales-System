FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

RUN npm install

COPY . .

RUN npm run build sales

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist/apps/sales ./dist/apps/sales
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

CMD ["node", "dist/apps/sales/main"]
