const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const log = require('./log');

const gameManager = require('./gameManager');
const lineManager = require('./lineManager');
const userManager = require('./userManager');

const DEBUG_ALLOWS_MULTIPLE_IPS = true;

let wss;
let heartbeat;
let started = false;
const connectedIps = {};
const connectedClients = {};

const init = () => {
  log.info(`[WS] Connection Manager - initialization`);
  startServer();
};

const startServer = () => {
  log.info('[WS] initializating websocket server at 7334');
  wss = new WebSocketServer({ port: 7334 });
  wss.on('connection', (clientSocket, req) => {
    const ip = req.socket.remoteAddress;
    log.info(`[WS] incomming connection from ${ ip }`);
    onConnectionAttemp(clientSocket, ip);
  });
  heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        log.info(`[WS] player connection: ${ ws.sessionID } lost.`);
        return kickPlayer(ws.sessionID);
      }
      ws.isAlive = false;
      ws.send('ping:0');
    });
  }, 10000);
  started = true;
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
  const splitIndex = message.indexOf(':');
  const command = splitIndex >= 0 ? message.substr(0, splitIndex) : message;
  const data = splitIndex >= 0 && message.substr(splitIndex + 1);

  const user = userManager.getUser(clientSocket.sessionID);
  const connectionID = `${ clientSocket.ip }: ${ clientSocket.sessionID }`;

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
    case 'recoverSession':
      const [userID, password] = data.split('--');
      console.log(`${userID} -- ${password}`)
      const recovered = await user.recoverSession(userID, password);
      if (recovered) {
        clientSocket.send(`userRecovered:${ user.getUserID() }-${ user.getTurn() }`);
      } else {
        clientSocket.send('userRecoveryFails:1');
      }
    break;
    case 'allocateUser':
      const _userId = await user.allocateOnBlockchain(data); // data is the secret word
      if (_userId) {
        log.info(`[WS] connection: ${ connectionID } had allocated the userID: ${ user.getUserID() }`);
        clientSocket.send(`userAssigned:${ user.getUserID() }`);
      }
    break;
    case 'requestTurn':
      console.log(`current user turn: ${ user.getTurn() }`);
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
    case 'setADN':
      user.setAdn(data);
    break;
    case 'setBugName':
      user.setBugName(data);
    break;
    case 'setIntroWords':
      user.setIntroWords(data);
    break;
    case 'setLastWords':
      user.setLastWords(data);
    break;
    case 'setReadyToPlay':
      user.setLastWords(data);
    break;
    default:
      log.warn(`[WS] ${ connectionID} send an invalid message: ${ message }`);
  }
};

module.exports = {
  init,
  sendMessageTo,
  isStarted: () => started
}
