# Anclave frontend — 멀티스테이지: Vite 빌드 → nginx 정적 서빙
# VITE_API_BASE 는 빈 문자열(상대경로 /api) → nginx 가 backend 로 프록시.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
