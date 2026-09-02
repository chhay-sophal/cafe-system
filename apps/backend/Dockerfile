# Build context is the repo root (see .dockerignore there), not this
# directory - the backend imports packages/shared-types by relative path
# (bundled into dist/ by tsup at build time), and pnpm needs the whole
# workspace to resolve/install correctly.
#
#   docker build -f apps/backend/Dockerfile -t cafe-backend .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cafe-system/backend build

# `pnpm deploy` snapshots one workspace package plus its resolved production
# dependencies into a self-contained directory - much smaller than copying
# the whole monorepo's node_modules (every other app's deps, devDeps, etc.)
# into the runtime image. --legacy: backend doesn't consume any workspace:*
# sibling package as an installed dependency (packages/shared-types is
# imported by relative path and gets bundled into dist/ above), so it
# doesn't need pnpm's newer inject-workspace-packages deploy mode.
RUN pnpm --filter @cafe-system/backend deploy --prod --legacy /deploy/backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /deploy/backend/dist ./dist
COPY --from=build /deploy/backend/node_modules ./node_modules
COPY --from=build /deploy/backend/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/index.js"]
