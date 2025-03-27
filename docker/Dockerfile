# This must be run from the root of the project
# after executing the build. Better use `just docker-build`

# Use nginx on Alpine for a minimal final image
FROM nginx:alpine

# Install openssl to generate self-signed cert and cleanup afterwards
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -subj "/CN=localhost" \
    -keyout /etc/nginx/ssl/nginx-selfsigned.key \
    -out /etc/nginx/ssl/nginx-selfsigned.crt && \
    apk del openssl

# Copy built assets from the builder stage to nginx html folder
COPY dist /usr/share/nginx/html

# Instead of replacing the default config, copy additional headers config
COPY docker/extra-headers.conf /etc/nginx/conf.d/extra-headers.conf

# Copy the SSL configuration for https
COPY docker/ssl.conf /etc/nginx/conf.d/ssl.conf

EXPOSE 80
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]