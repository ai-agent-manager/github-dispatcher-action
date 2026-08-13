FROM node:26-alpine

# Install git and GitHub CLI (required by dispatcher code)
RUN apk add --no-cache git github-cli

# Install AI tool CLIs globally as root (before switching to non-root user)
# Must be pre-installed because the node user lacks permission to install globally
# Pinned versions — update deliberately and test before bumping
RUN npm install -g @anthropic-ai/claude-code@2.1.212 @github/copilot@1.0.71 @earendil-works/pi-coding-agent@0.80.10

COPY . /src
WORKDIR /src
RUN npm install
RUN npm run build

# Modify the node user to UID 1001 to match GitHub Actions runner
# This ensures the node user can read/write files in /github/workspace
RUN deluser --remove-home node && \
    addgroup -g 1001 node && \
    adduser -D -u 1001 -G node node

# Switch to non-root user
# Required: Claude Code refuses --dangerously-skip-permissions when running as root
RUN chown -R node:node /src
USER node

# Use absolute path because GitHub Actions sets working directory to /github/workspace
CMD [ "node", "/src/dist/index.js" ]