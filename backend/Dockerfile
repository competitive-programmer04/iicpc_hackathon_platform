# Installing the lightweight nodejs debian bookworm image
FROM node:22-bookworm-slim

# Installing the latest version of docker-cli so our nodejs server can start the magic tunnel
COPY --from=docker:latest /usr/local/bin/docker /usr/local/bin/docker

# Declaring the present working directory
WORKDIR /app

## building the dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install

COPY . .

# Exposing our backend port
EXPOSE 3000

# running our backend
CMD ["npm","start"]
