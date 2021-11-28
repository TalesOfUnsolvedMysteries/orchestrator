const { ethers, Contract, Wallet, logger } = require('ethers');
const log = require('./log');
const bugShowArtifact = require('./artifacts/bugShow.json');

let _contract;
let listeners = {};
let connected = false;

const networkConfig = {
  local_hardhat: {
    url: 'http://127.0.0.1:8545/',
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  },
  theta_privatenet: {
    url: 'http://127.0.0.1:18888/rpc',
    contractAddress: '0x52d2878492EF30d625fc54EC52c4dB7f010d471e',
    chainId: 366,
  },
  theta_testnet: {
      url: 'https://eth-rpc-api-testnet.thetatoken.org/rpc',
      contractAddress: '0xC8cC799f3d619f9D27Fb9765EB9bBc0A39B3B997',
      chainId: 365,
  },
  theta_mainnet: {
      url: 'https:1//eth-rpc-api.thetatoken.org/rpc',
      contractAddress: '',
      chainId: 361,
  },
};

const init = async () => {
  log.info(`[TC] Theta Connector - initialization`);
  try {
    await connect();
    connected = true;
    log.info(`[TC] Theta connection successful`);
  } catch(e) {
    log.error('[TC] error on connection');
    log.error(e);
  }
};

const connect = async () => {
  const { url, contractAddress } = networkConfig[process.env.NETWORK];
  const provider = new ethers.providers.JsonRpcProvider(url);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  _contract = new Contract(contractAddress, bugShowArtifact.abi, wallet);
  _contract.on('userAllocated', (sessionID, userID) => {
    log.info(`[TC] Blockchain userAllocated event: ${ sessionID } ${ userID }`);
    if (listeners['userAllocated'] && listeners['userAllocated'][sessionID]) {
      listeners['userAllocated'][sessionID](userID);
    }
  });
  _contract.on('turnAssigned', (userID, turn) => {
    log.info(`[TC] Blockchain turnAssigned event: ${ userID } ${ turn }`);
    if (listeners['turnAssigned'] && listeners['turnAssigned'][userID]) {
      listeners['turnAssigned'][userID](turn);
    }
  });
  _contract.on('linePeeked', (userID) => {
    log.info(`[TC] Blockchain linePeeked event: ${ userID }`);
    if (listeners['linePeeked'] && listeners['linePeeked']['_']) {
      listeners['linePeeked']['_'](userID);
    }
  });
  _contract.on('tokenRewarded', (userID, tokenId) => {
    log.info(`[TC] Blockchain tokenRewarded event: ${ userID } ${ tokenId }`);
    if (listeners['tokenRewarded'] && listeners['tokenRewarded'][userID]) {
      listeners['tokenRewarded'][userID](tokenId);
    }
  });
  _contract.on('pointsRewarded', (userID, points) => {
    log.info(`[TC] Blockchain pointsRewarded event: ${ userID } ${ points }`);
    if (listeners['pointsRewarded'] && listeners['pointsRewarded'][userID]) {
      listeners['pointsRewarded'][userID](points);
    }
  });
};

const getContract = () => {
  return _contract;
}

const addEventListener = (eventName, key, fn) => {
  if (!listeners[eventName]) {
    listeners[eventName] = {};
  }
  listeners[eventName][key] = fn;
};

const removeEventListener = (eventName, key) => {
  delete listeners[eventName][key];
}


const allocateUser = async(sessionID, secretWord) => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain allocating user for session: ${ sessionID } - (wait)`);
  const encodedKey = ethers.utils.solidityKeccak256(['string'],[secretWord]);
  const userID = await new Promise(async (resolve) => {
    addEventListener('userAllocated', sessionID, resolve);
    const tx = await _contract.allocateUser(sessionID, encodedKey, { gasLimit: '500000'});
    await tx.wait();
  });
  log.info(`[TC] user allocated: ${ userID } <<`);
  removeEventListener('userAllocated', sessionID);
  return { userID, encodedKey };
};

const syncUser = async (user) => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain syncing user: ${ user.getUserID() } - (wait)`);
  let turn = await _contract.line_turn(user.getUserID());
  const firstInLine = await _contract.first_in_line();
  console.log(firstInLine, turn);
  if (turn > 0) {
    log.info(`[TC] Blockchain user ${ user.getUserID() } has turn: ${ turn } <<`);
    user.assignTurn(turn);
  } else {
    log.info(`[TC] Blockchain user ${ user.getUserID() } don't have turn assigned <<`);
  }
};


const addToLine = async (userID) => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain requesting turn for user: ${ userID } - (wait)`);
  const turn = await new Promise(async (resolve) => {
    addEventListener('turnAssigned', userID, resolve);
    try {
      const tx = await _contract.addToLine(userID, { gasLimit: '500000'});
      await tx.wait();
    } catch (error) {
      console.error(error);
      resolve(0);
    }
  });
  log.info(`[TC] Blockchain user ${ userID } got turn: ${ turn } <<`);
  removeEventListener('turnAssigned', userID);
  return turn;
};

const peek = async () => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain line peek requested - (wait)`);
  const removedUserID = await new Promise(async (resolve) => {
    addEventListener('linePeeked', '_', resolve);
    const tx = await _contract.peek({ gasLimit: '500000'});
    await tx.wait();
  });
  log.info(`[TC] Blockchain first user in line removed <<`);
  removeEventListener('linePeeked', '_');
  return removedUserID;
};

const rewardGameToken = async (userID, nftUrl) => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain tokenRewarded event: ${ userID } ${ nftUrl } - (wait)`);
  const tokenReward = await new Promise(async (resolve) => {
    addEventListener('tokenRewarded', userID, resolve);
    const tx = await _contract.rewardGameToken(userID, nftUrl, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('tokenRewarded', userID);
  log.info(`[TC] Blockchain tokenRewarded <<`);
  return tokenReward;
};

const rewardPoints = async (userID, points) => {
  if (!_contract) throw Error('not connected to theta network');
  log.info(`[TC] >> Blockchain reward points event: ${ userID } ${ points } - (wait)`);
  const totalPoints = await new Promise(async (resolve) => {
    addEventListener('pointsRewarded', userID, resolve);
    const tx = await _contract.rewardPoints(userID, points, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('pointsRewarded', userID);
  log.info(`[TC] Blockchain points rewarded <<`);
  return totalPoints;
};

module.exports = {
  init,
  isConnected: () => connected,
  getContract,
  allocateUser,
  syncUser,
  addToLine,
  peek,
  rewardGameToken,
  rewardPoints,
  addEventListener,
  encodeKey: (key) => ethers.utils.solidityKeccak256(['string'],[key])
};
