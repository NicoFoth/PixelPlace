# syntax=docker/dockerfile:1

# --- Build the web client ------------------------------------------------------
FROM node:24-slim AS client
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client --no-audit --no-fund
COPY shared/ shared/
COPY client/ client/
RUN npm run build --prefix client

# --- Server, serving the client --------------------------------------------------
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server --omit=dev --no-audit --no-fund && npm cache clean --force
COPY shared/ shared/
COPY server/src/ server/src/
COPY --from=client /app/client/dist/ client/dist/

# A named volume mounted here inherits this ownership.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/src/main.ts"]
