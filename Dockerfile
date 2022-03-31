FROM node:15.11.0
RUN apt-get update -qq

WORKDIR /src

COPY . .
RUN npm install
