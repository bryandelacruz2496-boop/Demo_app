FROM node:20-alpine

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm install --production --legacy-peer-deps

# Copy backend source
COPY backend/ .

# Copy frontend files into public directory
RUN mkdir -p /app/public
COPY index.html /app/public/
COPY admin.html /app/public/
COPY student-login.html /app/public/
COPY school-calendar.html /app/public/
COPY school-calendar-page.css /app/public/
COPY school-calendar-page.js /app/public/
COPY style.css /app/public/
COPY script.js /app/public/
COPY student-portal.css /app/public/
COPY student-portal.js /app/public/
COPY admin-portal.css /app/public/
COPY admin-portal.js /app/public/
COPY logo.jpg /app/public/
COPY slide1.JPEG /app/public/
COPY slide2.jpeg /app/public/
COPY slide3.jpg /app/public/
COPY slide4.JPEG /app/public/
COPY news1.jpg /app/public/
COPY news2.jpg /app/public/
COPY news3.jpg /app/public/
COPY student-login-bg.jpg /app/public/
COPY about1.jpg /app/public/
COPY daily1.jpg /app/public/
COPY daily2.jpg /app/public/
COPY daily3.jpeg /app/public/
COPY daily4.jpg /app/public/
COPY daily5.jpg /app/public/
COPY event1.jpg /app/public/
COPY event2.jpeg /app/public/
COPY event3.jpg /app/public/
COPY event4.jpg /app/public/
COPY event5.jpg /app/public/
COPY crossingover1.png /app/public/
COPY crossingover2.jpg /app/public/
COPY crossingover3.png /app/public/
COPY riteofpassage1.JPEG /app/public/
COPY riteofpassage2.JPEG /app/public/
COPY camping1.png /app/public/
COPY camping2.jpg /app/public/
COPY camping3.jpg /app/public/
COPY camping4.JPEG /app/public/
COPY camping5.png /app/public/
COPY fieldlearning1.jpeg /app/public/
COPY fieldlearning2.jpeg /app/public/
COPY fieldlearning3.jpg /app/public/
COPY fieldlearning4.jpeg /app/public/
COPY fieldlearning5.jpg /app/public/
COPY datepicker.css /app/public/
COPY datepicker.js /app/public/
COPY manifest.json /app/public/
COPY sw.js /app/public/
COPY school-calendar/ /app/public/school-calendar/

RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["node", "server.js"]
