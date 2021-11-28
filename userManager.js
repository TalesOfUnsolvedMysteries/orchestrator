const { allocateUser, syncUser, encodeKey } = require('./thetaConnector');
const db = require('./dataManager');
const log = require('./log');

const users = {};
const userIDs = {};
const userGodotPeerIDs = {};


const USER_STATE = {
  CONNECTING: 0,
  CONNECTED: 1,
  INLINE: 2,
  BUSY: 3,
  READY_TO_PLAY: 4,
  PLAYING: 5,
  OUTLINE: 6,
  DISCONNECTED: 7,
};

const init = () => {
  log.info(`[UM] User Manager - initialization`);
}

const _createUser = (_sessionID) => {
  let sessionID = _sessionID; // temporal
  let userID = _sessionID;    // permanent
  let godotPeerID;            // temporal
  let thetaAccount;           // permanent
  let state = USER_STATE.CONNECTING;
  let encodedKey;             // permanent
  let turn=0;
  
  let adn;
  let bugName;
  let deathCause;
  let introWords;
  let lastWords;
  let score = 0;
  let achievements = [];

  const ackConnection = (key) => {
    if (state === USER_STATE.CONNECTING && key === sessionID){
      state = USER_STATE.CONNECTED;
      return true;
    }
    return false;
  }

  const allocateOnBlockchain = async (secretWord) => {
    if (userID !== sessionID) return;
    if (state === USER_STATE.BUSY) return;
    const previousState = state;
    state = USER_STATE.BUSY;
    const reply = await allocateUser(sessionID, secretWord);
    delete userIDs[userID];
    userID = reply.userID;
    userIDs[userID] = sessionID;
    encodedKey = reply.encodedKey;
    log.info(`[UM] userID allocated to ${ userID }`);
    log.info(`[UM] protected by ${ encodedKey }`);
    await db.saveUser(userID, encodedKey);
    state = previousState;
    return userID;
  };

  const recoverSession = async (_userID, password) => {
    const _encodedKey = encodeKey(password);
    const _user = await db.getUser(_userID, _encodedKey);
    if (!_user) {
      return false;
    }
    delete userIDs[userID];
    userID = _user.id;
    encodedKey = _user.password;
    thetaAccount = _user.address;
    userIDs[userID] = sessionID;
    await syncUser(_self);
    return true;
  };

  const assignTurn = async (_turn) => {
    turn = _turn;
    state = USER_STATE.INLINE;
  };

  const setGodotPeer = (_godotPeerID) => {
    godotPeerID = _godotPeerID;
    if (godotPeerID) {
      userGodotPeerIDs[godotPeerID] = sessionID;
    } else {
      delete userGodotPeerIDs[godotPeerID];
    }
  };

  const setAdn = (_adn) => {
    // must validate this user can have this adn
    adn = _adn;
  };

  const scorePoints = async (points) => {
    await thetaConnector.rewardPoints(userID, points);
    score += points;
  };

  const awardGameToken = async (rewardId, ipnft) => {
    await thetaConnector.rewardGameToken(userID, ipnft);
    achievements.push(rewardId);
  }

  const _self = {
    ackConnection,
    allocateOnBlockchain,
    recoverSession,
    assignTurn,
    setGodotPeer,
    getSessionID: _ => sessionID,
    getUserID: _ => userID,
    getGodotPeerID: _ => godotPeerID,
    getThetaAccount: _ => thetaAccount,
    getState: _ => state,
    getTurn: _ => turn,
    getAdn: _ => adn,
    getBugName: _ => bugName,
    getDeathCause: _ => deathCause,
    getIntroWords: _ => introWords,
    getLastWords: _ => lastWords,
    getScore: _ => score,
    getAchievements: _ => achievements,
    setAdn,
    setBugName: _bugName => bugName = _bugName,
    setDeathCause: _deathCause => deathCause = _deathCause,
    setIntroWords: _introWords => introWords = _introWords,
    setLastWords: _lastWords => lastWords = _lastWords,
    scorePoints,
    awardGameToken,
    asObject: _ => {
      return {
        sessionID,
        userID,
        godotPeerID,
        thetaAccount,
        state,
        turn,
        adn,
        bugName,
        deathCause,
        introWords,
        lastWords,
        score,
        achievements
      }
    },
  };
  return _self;
}

const deleteUser = (sessionID) => {
  const user = users[sessionID];
  const userID = user.getUserID();
  delete users[sessionID];
  delete userIDs[userID];
};
const getUser = (sessionID) => users[sessionID];
const getUserByUserID = (userID) => getUser(userIDs[userID]);
const getUserByGodotPeerID = (godotPeerID) => getUser(userGodotPeerIDs[godotPeerID]);
const registerUser = (sessionID) => {
  if (users[sessionID]) return; // already registered
  const user = _createUser(sessionID);
  users[sessionID] = user;
  userIDs[user.getUserID()] = sessionID;
  return user;
};

const isPlayerConnected = (sessionID) => {
  const user = users[sessionID];
  return user && user.getState() !== USER_STATE.CONNECTING;
}
// User
// theta-account
// userID
// peerID
// status = outline, playing, inline

// active player -> user in play mode


// save a session user
// only two-three players required to be connected, 
// allow calls only to be accepted by the specified ip, this case 127.0.0.1 or localhost
// how should work the communication between godot-server and node-server?

// add to line doesnt require game to be connected
// only active player can receive rewards -> token and points

// allocate a user is the first step in player coordination/synchronization?
// optional - users can link their theta account
  // it require to check if there is an existing userId for this user
  // if yes, 
// join to the line

// godot client flow require user allocation to connect to the server
// theta account require user allocation to connect it

module.exports = {
  init,
  getUser,
  getUserByUserID,
  getUserByGodotPeerID,
  deleteUser,
  registerUser,
  isPlayerConnected,
  USER_STATE
};
