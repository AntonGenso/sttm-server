FROM node:20-alpine

WORKDIR /app

RUN apk update && apk upgrade && apk add git

COPY package*.json ./
RUN npm install && npm cache clean --force  

COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]