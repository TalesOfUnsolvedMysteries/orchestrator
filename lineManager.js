const blockchainConnector = require('./nearConnector');
const userManager = require('./userManager');
const { USER_STATE } = userManager;

const log = require('./log');
// should guarantee the state of the line

// sequence or user ids
let line = [];
let currentTurn = 0;
let firstInLine = 0;
let onLineChange = _ => _;

const init = async (_onLineChange) => {
  log.info(`[LM] Line Manager - initialization`);
  await syncLine();
  onLineChange = _onLineChange;
};

const syncLine = async () => {
  const contract = blockchainConnector.getContract();
  log.info(`[LM] line syncronization... (wait)`);
  line = await contract.getLine();
  firstInLine = line[0] || 0;
  
  if (firstInLine != 0) {
    const firstUser = await contract.getUserObject({userId: firstInLine});
    currentTurn = firstUser.turn;
  }

  log.info(`[LM] current line: [${ line.join('-') }]`);
  log.info(`[LM] current turn: ${ currentTurn }`);
  onLineChange();
}

// remove the first user from the line
const peek = async () => {
  let userID = -1;
  if (line.length == 0) return userID;
  try {
    userID = await blockchainConnector.peek();
    log.warn(`[GM] ${ userID } removed from the line.`);
  } catch (e) {
    log.error(`[LM] error on line manager`);
    log.error(e);
  }
  await syncLine();
  return userID;
};

const userTurnRequests = [];

const requestTurnFor = async (user) => {
  const { state, userID, sessionID, turn } = user.asObject();
  console.log('request turn');
  console.log(state);
  console.log(userID);
  console.log(sessionID);
  console.log(turn);

  //if (state === USER_STATE.CONNECTED || state === USER_STATE.OUTLINE) {
  if (userID === sessionID) { // not allocated on blockchain
    log.warn(`[LM] ${ sessionID } Can't join to line, request allocation for this player first`);
    return;
  }
  if (turn > 0) {
    log.warn(`[LM] ${ sessionID } This user already has a turn assigned: ${ turn }`);
    return;
  }
  if (userTurnRequests.indexOf(userID) !== -1) {
    log.warn(`[LM] there is a request for turn by user: ${ userID } already in progress`);
    return;
  }
  userTurnRequests.push(userID);
  const newTurn = await blockchainConnector.addToLine(userID);
  if (newTurn < 0) {
    log.warn(`[LM] ${ sessionID } Exception for this player`);
    return;
  }
  log.info(`[LM] ${ userID } has the turn ${ newTurn }`);
  user.assignTurn(newTurn);
  await syncLine();
  const index = userTurnRequests.indexOf(userID);
  userTurnRequests.splice(index, 1);
  //}
};

const getFirstInLine = () => {
  const [ firstID ] = line;
  if (!firstID) return null;
  const firstUser = userManager.getUserByUserID(firstID);
  // should check if the user is online if not should be kicked.
  return firstUser;
};

const getNextPlayer = () => {
  const [,nextID] = line;
  if (!nextID) return null;
  const nextUser = userManager.getUserByUserID(nextID);
  // should check if the user is online if not, send a notification?
  return nextUser;
};


module.exports = {
  init,
  syncLine,
  peek,
  requestTurnFor,
  getFirstInLine,
  getNextPlayer,
  isLineEmpty: _ => line.length == 0
};

