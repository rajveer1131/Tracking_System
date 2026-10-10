# Node.js Lightweight Container
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose port and start
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
