# ---------- base ----------
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---------- dev ----------
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM base AS build
# Igual que en el backend: el lockfile manda, para que el bundle que se prueba
# y el que se despliega salgan de las mismas versiones.
RUN npm ci
COPY . .
# Vite resuelve las variables al construir, no al ejecutar: quedan dentro del
# bundle. Por eso llegan como build args y no como environment. La CSP se
# genera aqui con el dominio del API dentro (ver vite.config.js), asi que si
# esto falta, el navegador cortaria las llamadas al API en produccion.
ARG VITE_API_URL=/api
ARG VITE_BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

# ---------- prod ----------
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
