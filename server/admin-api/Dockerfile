FROM node:22-alpine

RUN apk add --no-cache docker-cli docker-cli-compose git

WORKDIR /app
COPY server/admin-api/server.mjs ./server.mjs

ENV PORT=7354
ENV REPOSITORY_DIRECTORY=/workspace
ENV NAKAMA_LOCAL_CONFIG=/run/nakama/local.yml

EXPOSE 7354
CMD ["node", "server.mjs"]
