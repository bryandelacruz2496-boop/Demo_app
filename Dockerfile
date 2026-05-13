FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY admin.html /usr/share/nginx/html/
COPY student-login.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY student-portal.css /usr/share/nginx/html/
COPY student-portal.js /usr/share/nginx/html/
COPY admin-portal.css /usr/share/nginx/html/
COPY admin-portal.js /usr/share/nginx/html/
COPY logo.png /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
