# Anclave backend — Hono(Node) REST. seed/worker 도 같은 이미지로 실행.
# lock 파일 없어 npm install 사용. 의존성 3종(hono·@hono/node-server·pg).
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8787
CMD ["node", "server/index.mjs"]
