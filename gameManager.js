const { v4: uuidv4 } = require('uuid');
const userManager = require('./userManager');
const lineManager = require('./lineManager');
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

// ask next player to connect
const preparePlayer = () => {
};

// move the line forward
const setActivePlayer = () => {
};

// allow active player to control the game server
const startGame = () => {

};

// stop active player to control the game server
const endGame = () => {
};

// 
const start = async () => {
  if (state !== GAME_STATE.READY) {
    console.log('game can not start');
    return false;
  }
  const first = lineManager.getFirstInLine();
  if (!first) {
    console.log('there are no players ready to play');
    // check the line length...
    const _userID = await lineManager.peek();
    console.log(`${ _userID } removed from the line.`);
    setTimeout(start, 20000);
    return;
  }
  console.log(first.asObject());
  
  requestClientConnection(first);
}
const pendingConnections = {};


const requestClientConnection = (user) => {
  const secretKey = uuidv4().replace(/\-/g, ''); // generate it
  pendingConnections[secretKey] = user.asObject();
  gameServerSocket.send(`gs_waitForConnection:${ secretKey }`);
  // key will be valid only for 10 seconds
  setTimeout(() => delete pendingConnections[secretKey], 10000);
}

const checkLine = () => {
  
};

const init = (_connectionManager) => {
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
      console.log('server is ready');
      state = GAME_STATE.READY;
      setTimeout(start, 5000);
    break;
    case 'gs_waitingConnection': {
      const { sessionID } = pendingConnections[data];
      connectionManager.sendMessageTo(sessionID, `gc_connect:${ data }`);
      setTimeout(()=>console.log('timeout'), 10000);
    }
    break;
    case 'gs_connectionFail': {
      // handle failed connection
      const { sessionID } = pendingConnections[data];
      console.log('connection fails :(');
    }
    break;
    case 'gs_connectionSuccess': {
      console.log('gs connection success', data);
      const [secret, godotPeerID] = data.split('-');
      const pendingConnection = pendingConnections[secret];
      if (!pendingConnection) {
        console.log('is this connection valid?');
      } else {
        const { sessionID } = pendingConnection;
        const user = userManager.getUser(sessionID);
        user.setGodotPeer(godotPeerID);
        delete pendingConnection[secret];
        console.log('user connected!');
        console.log(user.asObject());
      }
    }
    break;
  }
}


module.exports = {
  init,
  registerServer,
  handleCommand
};
