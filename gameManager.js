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

const GAME_STATE_NAME = ['OFFLINE', 'CONNECTING', 'READY', 'PLAYING', 'BUSY'];
let state;
let gameServerSocket;

// required connections
let currentPlayer;

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
const servePlayer = async (user) => {
  log.warn(`[GM] user_id: ${ user.getUserID() } is going to play next.`);
  setState(GAME_STATE.BUSY);
  // check player is connected tcp
  let godotPeerID = user.getGodotPeerID();
  console.log('godot peer id', godotPeerID);
  if (!godotPeerID) {
    console.log('going to request conneciton');
    const isConnected = await requestClientConnection(user);
    console.log('is user connected?', isConnected);
    if (!isConnected) {
      setState(GAME_STATE.READY);
      return false;
    }
    godotPeerID = user.getGodotPeerID();
    console.log('it looks good', godotPeerID);
  }
  
  // player is connected and ready to play.
  currentPlayer = godotPeerID;
  // ask player to take control of the game
  gameServerSocket.send(`gs_assignPilot:${ godotPeerID }`);
  // verify player is controlling the game?
  // starts recording
  await obsConnector.startRecording(`player-${ user.getTurn() }`);
  // change scene on obs to main game
  await obsConnector.setScene('Game');
  // starts countdown
  setState(GAME_STATE.PLAYING);
  setTimeout(() => console.log('check player disconnection'), 5.2*60*1000);
  return true;
};


// stop active player to control the game server
// game transition from playing to ready
// do this before calling gameOver
// - take screenshot of the game <in game>
// - ask player to write last words <in game> -> <WS>
// - take out control to the player <in game>
const gameOver = async (peerID, deathCause) => {
  console.log(`01 > ${ peerID } setting to busy`);
  setState(GAME_STATE.BUSY);
  // current player must be the same peerId
  if (peerID != currentPlayer) {
    log.error(`bad peer id requested to end game ${ peerID }`);
    return;
  }
  const user = userManager.getUserByGodotPeerID(peerID);
  // by now sudden disconections won't save user play on blockchain.
  if (!user) {
    log.error(`[GM] user was disconnected, can't save it's state now.`);
    obsConnector.stopRecording();
    currentPlayer = -1;
    setState(GAME_STATE.READY);
    await lineManager.peek();
    return;
  }
  log.warn(`[GM] Game over for user_id: ${ user.getUserID() }`);
  
  // saves cause of death <WS>
  user.setDeathCause(deathCause);

  // stops recording
  // upload video to theta network -> via obsConnector
  
  // save video id
  const videoId = await new Promise(async (resolve) => {
    obsConnector.onVideoSaved(resolve);
    obsConnector.stopRecording();
  });
  console.log(`02 > post game ${ videoId }`);
  // change scene on obs to other stuff
  await obsConnector.setScene('postGame');
  
  // - moves to the bug card scene <in game>
  // - saves screenshot <in game>
  // -wait until card is generated
  console.log(`03 > save image`);
  const imageFile = await new Promise((resolve) => {
    onMessageConfirmation = (message, data) => {
      console.log(message, data);
      if (message == 'gs_cardGenerated') resolve(data);
    };
    console.log(`04 > generate card`);
    gameServerSocket.send(`gs_generateCard:p_${ user.getTurn() }`);
  });
  console.log(`05 > image file ${ imageFile }`);

  // - split image in two
  // - save NFT on storage -> when video is uploaded and images generated
  const ipnft = await nftManager.generateNFT(user, imageFile, videoId);
  console.log(`06 > ipnft ${ ipnft }`);
  // - create a reward for player with NFT metadata id
  await thetaConnector.rewardGameToken(user.getUserID(), ipnft);
  console.log(`07 > rewarded game token`);
  // - kick player from tcp connection <GAME>
  user.setGodotPeer(-1);
  currentPlayer = -1;
  // - line.peek
  setState(GAME_STATE.READY);
  await lineManager.peek();
};


const setupNextPlayer = async (user) => {
  await requestClientConnection(user);
};


const requestClientConnection = async (user) => {
  const secretKey = uuidv4().replace(/\-/g, ''); // generate it
  pendingConnections[secretKey] = user.asObject();
  const isConnected = await new Promise((resolve) => {
    console.log('sending connection?');
    gameServerSocket.send(`gs_waitForConnection:${ secretKey }`);
    let _count = 0;
    const _checkUserStatus = () => {
      if (_count >= 20) { // 10 seconds
        delete pendingConnections[secretKey];
        return resolve(false);
      }
      if (!user.getGodotPeerID()) {
        _count += 1;
        console.log('not ready, try again=', _count);
        return setTimeout(_checkUserStatus, 500);
      }
      console.log('resolve to true');
      resolve(true);
    };
    _checkUserStatus();
  });
  console.log('isConnected', isConnected);
  return isConnected;
}

const rewardPoints = async (user, points) => {
  await user.scorePoints(points);
};

const rewardGameToken = async (user, rewardId) => {
  const ipnft = await nftManager.allocateRewardToken(rewardId);
  await user.awardGameToken(rewardId, ipnft);
};

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
  log.info(`[GM] Game state change from: ${ GAME_STATE_NAME[state] } to ${ GAME_STATE_NAME[newState] }`);
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
      onMessageConfirmation(command, data);
    }
    break;
    case 'gs_gameOver': {
      const [peerId, causeOfDeath] = data.split('-');
      gameOver(peerId, causeOfDeath);
    }
    break;
    case 'gs_player_disconnected': {
      const user = userManager.getUserByGodotPeerID(peerID);
      user.setGodotPeer(null);
      // handle player disconnection?
    }
    break;
    case 'gs_player_score': {
      const user = userManager.getUserByGodotPeerID(currentPlayer);
      rewardPoints(user, parseInt(data));
    }
    break;
    case 'gs_player_reward': {
      const user = userManager.getUserByGodotPeerID(currentPlayer);
      rewardGameToken(user, data);
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
  setupNextPlayer,
  getState: () => state
};
