FROM node:24-alpine

# Install git and GitHub CLI (required by dispatcher code)
RUN apk add --no-cache git github-cli

COPY . /src
WORKDIR /src
RUN npm install
RUN npm run build

# GitHub Actions mounts the consumer's workspace at /github/workspace
CMD [ "node", "/src/dist/index.js" ]