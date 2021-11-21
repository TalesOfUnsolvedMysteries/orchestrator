const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const log = require('./log');

const gameManager = require('./gameManager');
const lineManager = require('./lineManager');
const userManager = require('./userManager');

const DEBUG_ALLOWS_MULTIPLE_IPS = true;

let wss;
const connectedIps = {};
const connectedClients = {};

const init = () => {
  log.info(`[WS] Connection Manager - initialization`);
  log.info('[WS] initializating websocket server at 8080');
  wss = new WebSocketServer({ port: 8080 });
  wss.on('connection', (clientSocket, req) => {
    const ip = req.socket.remoteAddress;
    log.info(`[WS] incomming connection from ${ ip }`);
    onConnectionAttemp(clientSocket, ip);
  });
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        log.info(`[WS] player connection: ${ ws.sessionID } lost.`);
        return kickPlayer(ws.sessionID);
      }
      ws.isAlive = false;
      ws.send('ping:0');
    });
  }, 10000);
};

const onConnectionAttemp = (clientSocket, ip) => {
  const sessionID = uuidv4();
  userManager.registerUser(sessionID);
  connectedClients[sessionID] = clientSocket;
  clientSocket.sessionID = sessionID;
  // check connected ips
  if (!DEBUG_ALLOWS_MULTIPLE_IPS && connectedIps[ip]) {
    // user already connected
    // reject or destroy the other communication?
    // easier to reject at this moment.
    log.info(`[WS] player from ${ ip } is already connected`);
    kickPlayer(sessionID, false);
    return;
  }
  connectedIps[ip] = sessionID;
  clientSocket.ip = ip;
  clientSocket.send(`connecting:${ sessionID }`);
  setTimeout(() => {
    if (userManager.isPlayerConnected(sessionID)) return;
    log.info(`[WS] connection timeout for ${ ip }: ${ sessionID }`);
    kickPlayer(sessionID);
  }, 5000);

  clientSocket.isAlive = true;
  clientSocket.on('message', (message) => messageParser(clientSocket, message));
  clientSocket.on('close', () => {
    log.info(`[WS] ${ip }: ${ sessionID } closed`);
    kickPlayer(sessionID);
  });
};

const kickPlayer = (sessionID, removeIp = true) => {
  const user = userManager.getUser(sessionID);
  if (!user) return;
  const clientSocket = connectedClients[sessionID];
  clientSocket.terminate();
  userManager.deleteUser(sessionID);
  if (removeIp) {
    delete connectedIps[clientSocket.ip];
  }
  delete connectedClients[sessionID];
};

const sendMessageTo = (sessionID, message) => {
  const clientSocket = connectedClients[sessionID];
  clientSocket.send(message);
};

const messageParser = async (clientSocket, message) => {
  message = `${message}`;
  const [command, data] = message.split(':');
  const user = userManager.getUser(clientSocket.sessionID);
  const connectionID = `${ clientSocket.ip }: ${ clientSocket.sessionID }`;
  // console.log(`${clientSocket.sessionID} sends: ${ message }`);
  if (clientSocket.isGameServer && command.indexOf('gs_') === 0) {
    gameManager.handleCommand(command, data);
    return;
  }
  switch (command) {
    case 'ack':
      if (user.ackConnection(data)) {
        clientSocket.send('connected:1');
      }
    break;
    case 'pong':
      clientSocket.isAlive = true;
    break;
    case 'allocateUser':
      await user.allocateOnBlockchain(data); // data is the secret word
      log.info(`[WS] connection: ${ connectionID } had allocated the userID: ${ user.getUserID() }`);
      clientSocket.send(`userAssigned:${ user.getUserID() }`);
    break;
    case 'requestTurn':
      await lineManager.requestTurnFor(user);
      const turn = user.getTurn();
      if (!turn) log.warn(`[WS] connection: ${ connectionID } turn request was rejected`);
      clientSocket.send(`replyTurn:${ turn }`);
    break;
    case 'registerGameServer':
      log.info(`[WS] incoming game server registry. ${ connectionID }`);
      if (data === process.env.SECRET_GAME_KEY) {
        gameManager.registerServer(clientSocket);
      } else {
        console.warn(`[WS] ${ connectionID } sent an incorrect secret-key ${ data }`);
      }
    break;
    default:
      log.warn(`[WS] ${ connectionID} send an invalid message: ${ message }`);
  }
};

module.exports = {
  init,
  sendMessageTo,
}
