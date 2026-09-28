# The OTH map editor as one service: the Hono server, which also serves the
# built editor. Node 24 is what the suite runs on; bookworm (glibc) because
# the lockfile's sharp binary for Linux is the glibc one.
FROM node:24-bookworm-slim

WORKDIR /app

# The manifests first, so a change to the code alone reuses the installed modules.
COPY package.json package-lock.json ./
COPY packages/model/package.json packages/model/
COPY packages/renderer/package.json packages/renderer/
COPY packages/server/package.json packages/server/
COPY packages/editor/package.json packages/editor/
# Dev dependencies included: the server runs its TypeScript through tsx, and
# Vite builds the editor. Both are dev dependencies.
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build --workspace @oth/editor

# Secure cookies, error bodies without detail, and TEAM_CODE required.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@oth/server"]
