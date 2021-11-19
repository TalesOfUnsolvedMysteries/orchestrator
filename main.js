
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const thetaConnector = require('./thetaConnector');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
const { WebSocketServer } = require('ws');


const init = async () => {
  await thetaConnector.init();
  // const contract = thetaConnector.getContract();
  // const accessories = await contract.getGlobalAccessories();
  userManager.init();
  await lineManager.syncLine();
};

init();


const wss = new WebSocketServer({port: 8080});
const connectedIps = {};
const connectedClients = {};

wss.on('connection', (clientSocket, req) => {
  const ip = req.socket.remoteAddress;
  onConnectionAttemp(clientSocket, ip);
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log(`player ${ ws.sessionID } disconnected`);
      return kickPlayer(ws.sessionID);
    }
    ws.isAlive = false;
    ws.send('ping:0');
  });
}, 10000);

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

const onConnectionAttemp = (clientSocket, ip) => {
  const sessionID = uuidv4();
  userManager.registerUser(sessionID);
  connectedClients[sessionID] = clientSocket;
  clientSocket.sessionID = sessionID;
  // check connected ips
  if (connectedIps[ip]) {
    // user already connected
    // reject or destroy the other communication?
    // easier to reject at this moment.
    console.log('player already connected');
    kickPlayer(sessionID, false);
    return;
  }
  connectedIps[ip] = sessionID;
  clientSocket.ip = ip;
  clientSocket.send(`connecting:${ sessionID }`);
  setTimeout(() => {
    if (userManager.isPlayerConnected(sessionID)) return;
    console.log(`timeout expiration for ${ sessionID }`);
    kickPlayer(sessionID);
  }, 5000);

  clientSocket.isAlive = true;
  clientSocket.on('message', (message) => messageParser(clientSocket, message));
  clientSocket.on('close', () => {
    console.log(`user ${ sessionID } disconnected`);
    kickPlayer(sessionID);
  });

}


const messageParser = async (clientSocket, message) => {
  message = `${message}`;
  const [command, data] = message.split(':');
  const user = userManager.getUser(clientSocket.sessionID);
  // console.log(`${clientSocket.sessionID} sends: ${ message }`);
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
      console.log(user.getUserID());
      clientSocket.send(`userAssigned:${ user.getUserID() }`);
    break;
    case 'requestTurn':
      await lineManager.requestTurnFor(user);
      const turn = user.getTurn();
      if (!turn) console.log('rejected');
      clientSocket.send(`replyTurn:${ turn }`);
    break;
    default:
      console.log('received an invalid message');
      console.log(message);
  }
}
