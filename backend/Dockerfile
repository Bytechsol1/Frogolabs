FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY validation ./validation/

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/main.js"]
