FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

RUN echo "=== dist contents ===" && ls -la dist/ || echo "=== dist NOT FOUND ==="

EXPOSE 3000

CMD ["node", "dist/main.js"]
