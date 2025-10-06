# This must be run from the root of the project
# after executing the build. Better use `just docker-build`

# Use nginx on Alpine for a minimal final image
FROM nginx:alpine

# Copy custom nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from the builder stage to nginx html folder
COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]