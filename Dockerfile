FROM node:26-alpine

# Install git and GitHub CLI (required by dispatcher code)
RUN apk add --no-cache git github-cli

# Install AI tool CLIs globally as root (before switching to non-root user)
# Must be pre-installed because the node user lacks permission to install globally
# Pinned versions — update deliberately and test before bumping.
# pi-coding-agent and pi-provider-litellm are image-pinned together.
# Provider 4.2.0 requires pi >= 0.99.2 and ships TypeScript source only
# (no dist/), so the provider entry point is src/index.ts.
# The adapter loads pi-provider-litellm from npm's default /usr/local prefix.
# Keep --legacy-peer-deps: pi loads the provider with its own bundled packages,
# so npm must not add a second, floating copy of the provider's peer packages.
RUN npm install --global --legacy-peer-deps \
    @anthropic-ai/claude-code@2.1.296 \
    @github/copilot@1.0.95 \
    @earendil-works/pi-coding-agent@1.1.0 \
    pi-provider-litellm@4.2.0 && \
    test -f /usr/local/lib/node_modules/pi-provider-litellm/src/index.ts && \
    pi --version && \
    pi --extension /usr/local/lib/node_modules/pi-provider-litellm/src/index.ts --help >/dev/null

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