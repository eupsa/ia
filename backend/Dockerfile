FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace backend --omit=dev && npm cache clean --force
COPY backend/src ./backend/src
RUN mkdir /data && chown node:node /data
USER node
ENV DB_PATH=/data/chat.db
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
