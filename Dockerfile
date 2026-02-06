# Base image
FROM node:20-alpine

# Install Docker CLI
USER root
RUN apk add --no-cache docker-cli bash curl

# Create working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot code
COPY bot.js ./

# Default command
CMD ["node", "bot.js"]
