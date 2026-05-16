FROM node:20-alpine

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm install --production

# Copy backend source
COPY backend/ .

# Copy frontend files into public directory
RUN mkdir -p /app/public
COPY index.html /app/public/
COPY admin.html /app/public/
COPY student-login.html /app/public/
COPY style.css /app/public/
COPY script.js /app/public/
COPY student-portal.css /app/public/
COPY student-portal.js /app/public/
COPY admin-portal.css /app/public/
COPY admin-portal.js /app/public/
COPY logo.png /app/public/
COPY datepicker.css /app/public/
COPY datepicker.js /app/public/
COPY manifest.json /app/public/
COPY sw.js /app/public/

RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["node", "server.js"]
