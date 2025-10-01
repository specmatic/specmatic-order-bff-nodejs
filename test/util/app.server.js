const http = require("node:http");
let app;

function startAppServer(port) {
  return new Promise((resolve, _reject) => {
    app = require("../../src/app.js");
    const server = http.createServer(app);
    server.listen(port);
    server.on("listening", async () => {
      console.debug(`Running BFF server @ http://${server.address().address}:${server.address().port}`);
      resolve(server);
    });
  });
}

function stopAppServer(appServer) {
  return new Promise((resolve, reject) => {
    console.debug("Stopping BFF server");
    appServer.close((err) => {
      if (err) {
        console.error(`Stopping BFF failed with ${err}`);
        reject();
      } else {
        console.info("Stopped BFF server");
        resolve();
      }
    });
  });
}

function getApp() {
  return app;
}

module.exports = { getApp, startAppServer, stopAppServer };
