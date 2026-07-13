FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html env.d.ts tsconfig.json vite.config.ts ./
COPY src/main.ts src/App.vue src/app.css ./src/
COPY src/api/jobs.ts ./src/api/jobs.ts
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
