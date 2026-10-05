# The OTH map editor as one service: the Hono server, which also serves the
# built editor. Node 24 is what the suite runs on; bookworm (glibc) because
# the lockfile's sharp binary for Linux is the glibc one.
#
# Two stages, because the editor is built with tooling the server never runs.
# One stage installed the dev dependencies and shipped them: vite, vitest,
# tailwindcss and playwright sat on the image's disk, and npm audit's findings
# for them — a critical and three highs among them — were production findings
# for as long as they did. The build stage installs them; the image that runs
# holds production dependencies only.
FROM node:24-bookworm-slim AS build

WORKDIR /app

# The manifests first, so a change to the code alone reuses the installed modules.
COPY package.json package-lock.json ./
COPY packages/model/package.json packages/model/
COPY packages/renderer/package.json packages/renderer/
COPY packages/server/package.json packages/server/
COPY packages/editor/package.json packages/editor/
# Dev dependencies included: Vite builds the editor, and it is a dev dependency.
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build --workspace @oth/editor


FROM node:24-bookworm-slim AS runtime

WORKDIR /app

# The same manifests in the same order, so this install is reused on a change
# to the code alone just as the build stage's is.
COPY package.json package-lock.json ./
COPY packages/model/package.json packages/model/
COPY packages/renderer/package.json packages/renderer/
COPY packages/server/package.json packages/server/
COPY packages/editor/package.json packages/editor/
# Production dependencies only — and never --omit=optional, which would drop
# sharp's Linux binary. The server runs its TypeScript through tsx and
# src/index.ts imports the PGlite fallback whether or not DATABASE_URL takes
# that branch, so @oth/server carries both among its dependencies rather than
# its dev dependencies, and this line keeps them.
RUN npm ci --omit=dev --no-audit --no-fund

# The source as it stands: the server runs its TypeScript from
# packages/server/src and reads its migrations from packages/server/drizzle.
# .dockerignore keeps node_modules out, so this cannot overwrite the install
# above, and keeps dist out, so the editor can only come from the build stage.
COPY . .
COPY --from=build /app/packages/editor/dist packages/editor/dist

# Secure cookies, error bodies without detail, and TEAM_CODE required.
ENV NODE_ENV=production
# The volume's mount path, so the service needn't set it. A missing variable
# then still writes to /data rather than to ./data on the container's own
# disk, which the next deploy wipes. A variable that is set, even mangled or
# empty, overrides this.
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@oth/server"]
