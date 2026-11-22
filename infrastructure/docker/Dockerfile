# Single image: builds the web app and serves it from the API server.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/print-bridge/package.json apps/print-bridge/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /data/uploads && chown -R node:node /data /app/apps/server
ENV UPLOAD_DIR=/data/uploads WEB_DIST=/app/apps/web/dist
EXPOSE 4000
# do not run as root: a bug in the app must not become control of the container
USER node
WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]
