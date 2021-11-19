const thetaConnector = require('./thetaConnector');
const userManager = require('./userManager');
const { USER_STATE } = userManager;
// should guarantee the state of the line

// sequence or user ids
let line = [];
let currentTurn = 0;
let firstInLine = 0;
const syncLine = async () => {
  const contract = thetaConnector.getContract();
  firstInLine = await contract.first_in_line();
  currentTurn = await contract.line_turn(firstInLine);
  line = await contract.getLine();
  console.log(line);
  console.log(currentTurn);
}

// remove the first user from the line
const peek = async () => {
  let userID = -1;
  if (line.length == 0) return userID;
  try {
    userID = await thetaConnector.peek();
  } catch (e) {
    console.error(e);
  }
  await syncLine();
  return userID;
};


const requestTurnFor = async (user) => {
  const { state, userID, sessionID } = user.asObject();
  if (state === USER_STATE.CONNECTED || state === USER_STATE.OUTLINE) {
    if (userID === sessionID) { // not allocated on blockchain
      console.log('cant join to line, request allocation for this player first');
      return;
    }
    const turn = await thetaConnector.addToLine(user.getUserID());
    console.log(`${ user.getUserID() } got the turn ${ turn }`);
    user.assignTurn(turn);
    await syncLine();
  }
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
}


module.exports = {
  syncLine,
  peek,
  requestTurnFor,
  getFirstInLine,
  getNextPlayer
}

