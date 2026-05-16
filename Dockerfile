FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm install --production

# Copy backend source
COPY backend/ .

# Copy frontend files into public directory
RUN mkdir -p /app/public
COPY index.html admin.html student-login.html ./public/
COPY style.css script.js student-portal.css student-portal.js ./public/
COPY admin-portal.css admin-portal.js logo.png ./public/
COPY datepicker.css datepicker.js ./public/
COPY manifest.json sw.js ./public/

RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["node", "server.js"]
