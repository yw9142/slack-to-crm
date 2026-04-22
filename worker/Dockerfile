FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY worker/package.json worker/package.json

RUN yarn install --immutable

COPY tsconfig.json tsconfig.json
COPY worker worker

RUN yarn workspace slack-to-crm-worker build

ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

EXPOSE 8787

CMD ["yarn", "workspace", "slack-to-crm-worker", "start"]
