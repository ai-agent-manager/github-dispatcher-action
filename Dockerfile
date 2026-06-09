FROM node:24-alpine

# Install git and GitHub CLI (required by dispatcher code)
RUN apk add --no-cache git github-cli

# Install Claude Code CLI globally (as root, before switching to non-root user)
# The runtime code also calls `npm install -g @anthropic-ai/claude-code`, but we
# pre-install it here to avoid permission issues when running as the node user.
RUN npm install -g @anthropic-ai/claude-code

COPY . /src
WORKDIR /src
RUN npm install
RUN npm run build

# Switch to non-root user
# Required: Claude Code refuses --dangerously-skip-permissions when running as root
RUN chown -R node:node /src
USER node

# GitHub Actions mounts the consumer's workspace at /github/workspace
CMD [ "node", "/src/dist/index.js" ]