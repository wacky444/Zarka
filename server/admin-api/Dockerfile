FROM node:22-alpine

RUN apk add --no-cache docker-cli docker-cli-compose git

WORKDIR /app
COPY server/admin-api/server.mjs ./server.mjs

ENV PORT=8080
ENV REPOSITORY_DIRECTORY=/workspace
ENV NAKAMA_LOCAL_CONFIG=/run/nakama/local.yml

EXPOSE 8080
CMD ["node", "server.mjs"]
