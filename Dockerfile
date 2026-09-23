FROM node:22-alpine
WORKDIR /app

VOLUME /app/files

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 80
CMD ["node", "src/server.js"]