const { v4: uuidv4 } = require('uuid');
const log = require('./log');

const userManager = require('./userManager');
const obsConnector = require('./obsConnector');
const nftManager = require('./nftManager');
const thetaConnector = require('./thetaConnector');
const lineManager = require('./lineManager');

let connectionManager;
let stateChangeListener;

const GAME_STATE = {
  OFFLINE: 0,
  CONNECTING: 1,
  READY: 2,
  PLAYING: 3,
  BUSY: 4
}
let state;
let gameServerSocket;

// required connections
let currentPlayer;
let nextPlayer;
let previousPlayer;
const pendingConnections = {};

let onMessageConfirmation = _ => _;

const init = (_connectionManager, _stateChangeListener) => {
  log.info(`[GM] Game Manager - initialization`);
  setState(GAME_STATE.OFFLINE);
  connectionManager = _connectionManager;
  stateChangeListener = _stateChangeListener;
};

// allow active player to control the game server
// game transition from lobby to playing

// stop active player to control the game server
// game transition from playing to ready
// do this before calling endgame
// - take screenshot of the game <in game>
// - saves cause of death <WS>
// - ask player to write last words <in game> -> <WS>
// - take out control to the player <in game>
const endGame = async (peerID) => {
  setState(GAME_STATE.BUSY);
  // current player should be the same peerId
  if (peerID != currentPlayer) {
    log.error(`bad peer id requested to end game ${ peerID }`);
    return;
  }
  const user = userManager.getUserByGodotPeerID(peerID);
  // stops recording
  // upload video to theta network -> via obsConnector
  await obsConnector.stopRecording();
  // - save video id
  const videoId = await new Promise(resolve => obsConnector.onVideoSaved(resolve));
  // - change scene on obs to other stuff
  await obsConnector.setScene('PostGame');
  // - moves to the bug card scene <in game>
  // - saves screenshot <in game>
  // wait until card is generated
  const imageFile = await new Promise((resolve) => {
    onMessageConfirmation = message => {
      if (message == 'gs_cardGenerated') resolve();
    };
    gameServerSocket.send(`gs_generateCard:${ peerID }`);
  });
  // - split image in two
  // - save NFT on storage -> when video is uploaded and images generated
  const ipnft = await nftManager.generateNFT(user, imageFile, videoId);
  // - create a reward for player with NFT metadata id
  await thetaConnector.rewardGameToken(user.getUserID(), ipnft);
  // - kick player from tcp connection <GAME>
  // - line.peek
  setState(GAME_STATE.READY);
  await lineManager.peek();
};

// 
const servePlayer = async (user) => {
  log.warn(`[GM] user_id: ${ user.getUserID() } is going to play next.`);
  setState(GAME_STATE.BUSY);
  // check player is connected tcp
  requestClientConnection(user);
  const isConnected = await new Promise((resolve) => {
    let _count = 0;
    const _checkUserStatus = () => {
      if (_count >= 20) { // 10 seconds
        return resolve(false);
      }
      if (!user.getGodotPeerID()) {
        _count += 1;
        return setTimeout(_checkUserStatus, 500);
      }
      resolve(true);
    }
  });
  
  if (!isConnected) {
    // player is not connected and can not play
    setState(GAME_STATE.READY);
    return false;
  }
  // player is connected and ready to play.
  const godotPeerID = user.getGodotPeerID();
  currentPlayer = godotPeerID;
  // ask player to take control of the game
  gameServerSocket.send(`gs_assignPilot:${ godotPeerID }`);
  // verify player is controlling the game?
  // starts recording
  await obsConnector.startRecording(`player-${ user.getTurn() }`);
  // change scene on obs to main game
  // starts countdown
  setState(GAME_STATE.PLAYING);
  setTimeout(() => console.log('check player disconnection'), 5.2*60*1000);
};


const requestClientConnection = async (user) => {
  const secretKey = uuidv4().replace(/\-/g, ''); // generate it
  pendingConnections[secretKey] = user.asObject();
  gameServerSocket.send(`gs_waitForConnection:${ secretKey }`);
  // key will be valid only for 10 seconds
  setTimeout(() => delete pendingConnections[secretKey], 10000);
}


const registerServer = (websocketClient) => {
  gameServerSocket = websocketClient;
  gameServerSocket.isGameServer = true;
  setState(GAME_STATE.CONNECTING);
  gameServerSocket.send('gs_connected:1');
  gameServerSocket.on('close', () => {
    setState(GAME_STATE.OFFLINE);
  });
}

const setState = (newState) => {
  state = newState;
  if (stateChangeListener && (newState==GAME_STATE.READY || newState==GAME_STATE.OFFLINE)) {
    stateChangeListener();
  }
}

const handleCommand = async (command, data) => {
  switch(command) {
    case 'gs_ready':
      log.info('[GM] Game Server is ready');
      setState(GAME_STATE.READY);
    break;
    case 'gs_waitingConnection': {
      const { sessionID } = pendingConnections[data];
      connectionManager.sendMessageTo(sessionID, `gc_connect:${ data }`);
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
      }
    }
    break;
    case 'gs_cardGenerated': {
      onMessageConfirmation(command);
    }
    break;
    case 'gs_pilot_disconnected': {
      if (currentPlayer == data) {
        endGame(data);
      }
    }
    break;
  }
}


module.exports = {
  GAME_STATE,
  init,
  registerServer,
  handleCommand,
  servePlayer,
  getState: () => state
};
