# Music-Api 运行镜像：Node 24 原生跑 TypeScript，无构建、无运行时依赖。
FROM node:24-alpine

LABEL org.opencontainers.image.source="https://github.com/MoTeam-cn/Music-Api" \
      org.opencontainers.image.description="Public music metadata aggregation API (netease / tencent / kugou / baidu)" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8802

COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 8802

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:8802/v1/status?origin=healthcheck" >/dev/null || exit 1

CMD ["node", "src/main.ts"]
