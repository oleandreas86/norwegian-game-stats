FROM node:20-slim

# Install sqlite3 dependencies if needed (usually node-sqlite3 comes with prebuilt binaries, but just in case)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Ensure data directory exists
RUN mkdir -p src/data

# The app uses port 3000 by default
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
