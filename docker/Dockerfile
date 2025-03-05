# Build dependencies and app in a single stage
FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --frozen-lockfile

# Copy all source files
# We explicitly list only necessary files to allow building from a dev checkout.
# Make sure to update this list when adding new files used in the build.

# Start with infrequently changing files
COPY public/ ./public/
COPY index.html \
    postcss.config.cjs \
    tailwind.config.js \
    tsconfig.json \
    vite.config.mjs \
    ./

# Continue with frequently changing files
COPY src/ ./src/

# Build the app
RUN yarn build

# Use nginx on Alpine for a minimal final image
FROM nginx:alpine

# Copy built assets from the builder stage to nginx html folder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]