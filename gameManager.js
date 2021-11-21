const { v4: uuidv4 } = require('uuid');
const log = require('./log');

const lineManager = require('./lineManager');
const userManager = require('./userManager');
const { logger } = require('./log');

let connectionManager;

const GAME_STATE = {
  OFFLINE: 0,
  CONNECTING: 1,
  BUSY: 2,
  READY: 3,
  PLAYING: 4
}
let state;
let gameServerSocket;

// required connections
let currentPlayer;
let nextPlayer;
let previousPlayer;
const pendingConnections = {};

// allow active player to control the game server
// game transition from lobby to playing

// stop active player to control the game server
// game transition from playing to ready
const endGame = async (peerID) => {
  const _userID = await lineManager.peek();
};

// 
const start = async () => {
  if (state !== GAME_STATE.READY) {
    log.warn(`[GM] game can't start = STATE=${ state }`);
    return false;
  }
  const first = lineManager.getFirstInLine();
  if (!first) {
    log.warn('[GM] there are no players ready to play');
    // check the line length...
    const _userID = await lineManager.peek();
    log.warn(`[GM] ${ _userID } removed from the line.`);
    //setTimeout(start, 20000);
    return;
  }

  log.warn(`[GM] user_id: ${ first.getUserID() } is the first in line.`);
  requestClientConnection(first);
}



const requestClientConnection = (user) => {
  const secretKey = uuidv4().replace(/\-/g, ''); // generate it
  pendingConnections[secretKey] = user.asObject();
  gameServerSocket.send(`gs_waitForConnection:${ secretKey }`);
  // key will be valid only for 10 seconds
  setTimeout(() => delete pendingConnections[secretKey], 10000);
}


const init = (_connectionManager) => {
  log.info(`[GM] Game Manager - initialization`);
  state = GAME_STATE.OFFLINE;
  connectionManager = _connectionManager;
}

const registerServer = (websocketClient) => {
  gameServerSocket = websocketClient;
  gameServerSocket.isGameServer = true;
  state = GAME_STATE.CONNECTING;
  gameServerSocket.send('gs_connected:1');
}

const handleCommand = async (command, data) => {
  switch(command) {
    case 'gs_ready':
      state = GAME_STATE.READY;
      log.info('[GM] Game Server is ready');
      setTimeout(start, 5000);
    break;
    case 'gs_waitingConnection': {
      const { sessionID } = pendingConnections[data];
      connectionManager.sendMessageTo(sessionID, `gc_connect:${ data }`);
      setTimeout(()=>logger.warn('[GM] Connection timeout for game server'), 10000);
    }
    break;
    case 'gs_connectionFail': {
      // handle failed connection
      const { sessionID } = pendingConnections[data];
      log.warn(`[GM] Game Server Connection fails for ${ sessionID }`);
    }
    break;
    case 'gs_connectionSuccess': {
      const [secret, godotPeerID] = data.split('-');
      log.info(`[GM] client=${ godotPeerID } connection success`);
      const pendingConnection = pendingConnections[secret];
      if (!pendingConnection) {
        log.warn(`[GM] client=${ godotPeerID } connection not found in pending connections. should remove it?`);
      } else {
        const { sessionID } = pendingConnection;
        const user = userManager.getUser(sessionID);
        user.setGodotPeer(godotPeerID);
        delete pendingConnection[secret];
        log.info(`[GM] client=${ godotPeerID } associated to userID=${ user.getUserID() }`);
        gameServerSocket.send(`gs_assignPilot:${godotPeerID}`);
      }
    }
    break;
    case 'gs_pilot_disconnected': {
      endGame(data);
    }
    break;
  }
}


module.exports = {
  init,
  registerServer,
  handleCommand
};
