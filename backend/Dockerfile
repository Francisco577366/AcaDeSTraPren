# ---------- base ----------
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---------- dev ----------
FROM base AS dev
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------- prod ----------
FROM base AS prod
ENV NODE_ENV=production
# npm ci instala exactamente lo que dice el lockfile. Con npm install cada
# build podria resolver versiones distintas, asi que dos despliegues del mismo
# codigo no serian el mismo programa, y un parche comprometido entraria solo.
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# La imagen de node trae el usuario 'node' sin privilegios. Sin esto el
# proceso corre como root, y una ejecucion remota de codigo empezaria siendo
# root dentro del contenedor.
USER node
EXPOSE 4000
CMD ["npm", "start"]
