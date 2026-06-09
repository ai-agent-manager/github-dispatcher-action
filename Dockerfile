FROM node:24-alpine

COPY . /src
WORKDIR /src
RUN npm install
RUN npm run build

CMD [ "node", "/src/dist/index.js" ]