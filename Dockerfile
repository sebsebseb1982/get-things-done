# ---- Stage 1: Build Angular frontend ----
# Build on the native CI platform (amd64) to avoid QEMU crashes with Node 22+
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build


# ---- Stage 2: Compile TypeScript backend ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS backend-build

WORKDIR /backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build


# ---- Stage 3: Production image ----
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Compiled backend
COPY --from=backend-build /backend/dist ./dist

# Angular static assets served by Express
COPY --from=frontend-build /frontend/dist/frontend/browser ./public

# /app/data/todos.json — mount a host file or directory here for persistence
# Example: docker run -v /host/path/todos.json:/app/data/todos.json ...
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
# Override to restrict CORS to a specific origin, e.g. http://nas:3000
ENV CORS_ORIGIN=*

CMD ["node", "dist/index.js"]
