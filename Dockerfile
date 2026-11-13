# Backend do Pulyn em container.
# As dependências vêm da pasta node_modules do projeto (já instalada com npm ci), para não depender
# da rede do Docker durante a build. Todas são JavaScript puro, então rodam no Linux do container.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY . .

# Se alguma dependência estiver faltando, a build para aqui.
RUN node -e "require('express'); require('pg'); require('@pulyn/avatar'); require('@resvg/resvg-wasm'); console.log('dependências ok')"

EXPOSE 3001
CMD ["node", "index.js"]
