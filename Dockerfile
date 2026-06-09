FROM node:24-alpine

# Install git and GitHub CLI
RUN apk add --no-cache git github-cli

# Fix git "dubious ownership" error for GitHub Actions workspace
RUN git config --global --add safe.directory /github/workspace

COPY . /src
WORKDIR /src
RUN npm install
RUN npm run build

CMD [ "node", "/src/dist/index.js" ]