# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package management files
COPY package*.json bun.lock* ./

# Install dependencies
RUN npm ci

# Copy full frontend codebase
COPY . .

# Build the client and server assets
RUN npm run build

# Stage 2: Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary production files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose server port
EXPOSE 3000

# Start server using Vite's preview runner configured for container exposure
CMD ["npm", "run", "preview", "--", "--port", "3000", "--host", "0.0.0.0"]
