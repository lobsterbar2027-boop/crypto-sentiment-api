FROM node:18-alpine

# Install git (required for GitHub npm deps)
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
