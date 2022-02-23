const { ethers } = require('ethers');
const nearAPI = require('near-api-js');
const log = require('./log');
const signerAccountId = process.env.CONTRACT_NAME;
const contractName = process.env.SIGNEAR_ACCOUNT;

const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(
  process.env.CREDENTIALS_PATH
);

let _contract;
let connected = false;

const init = async () => {
  log.info(`[TC] Near Connector - initialization`);
  try {
    await connect();
    connected = true;
    log.info(`[TC] Near connection successful`);
  } catch(e) {
    log.error('[TC] error on connection');
    log.error(e);
  }
};

const networkConfig = {
  mainnet: {
    networkId: 'mainnet',
    nodeUrl: 'https://rpc.mainnet.near.org',
    contractName,
    walletUrl: 'https://wallet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    explorerUrl: 'https://explorer.mainnet.near.org',
  },
  testnet: {
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    contractName,
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://explorer.testnet.near.org',
  }
}

const connect = async () => {
  const network = networkConfig[process.env.NETWORK || 'testnet'];
  const near = await nearAPI.connect({
    deps: {
      keyStore,
    },
    ...network,
  });

  const account = await near.account(signerAccountId);

  _contract = new nearAPI.Contract(
    account,
    contractName,
    {
      // View methods are read only.
      viewMethods: [
        'getAccessoriesForUser',
        'getGameTokens',
        'getGlobalAccessories',
        'getUserObject',
        'hasAccessory',
        'turnsToPlay',
        'getLine',
        'getUserId',
        'getGameConfig',
        'getAccessory',
      ],
      // Change methods can modify the state.
      changeMethods: [
        'buyAccessory',             // user - payable
        'takeUserOwnership',
        'addToLine',                // admin
        'allocateUser',             // admin
        'buyAccessoryWithPoints',   // user
        'peek',                     // admin
        'rewardGameToken',          // admin
        'rewardPoints',             // admin
        'setBaseURI',               // admin
        'setMaxLineCapacity',       // admin
        'setMaxPointsReward',       // admin
        'setPriceToUnlockUser',     // admin
        'setPriceForAccessory',     // admin
        'setUserOwnership',         // admin
        'unlockAccessoryForPublic', // admin
        'removeAccessoryForPublic', // admin
        'unlockAccessoryForUser',   // admin
      ],
    }
  );
};

const getContract = () => {
  return _contract;
}

const allocateUser = async (sessionID, secretWord) => {
  if (!_contract) throw Error('not connected to near platform');
  log.info(`[TC] >> Blockchain allocating user for session: ${ sessionID } - (wait)`);
  const encodedKey = ethers.utils.solidityKeccak256(['string'],[secretWord]);
  const userID = await _contract.allocateUser({
    args: {
      uuid: sessionID,
      unlockKey: encodedKey
    }
  });
  log.info(`[TC] user allocated: ${ userID } <<`);
  return { userID, encodedKey };
};

const syncUser = async (user) => {
  if (!_contract) throw Error('not connected to Near network');
  const userId = user.getUserID();
  log.info(`[TC] >> Blockchain syncing user: ${ userId } - (wait)`);
  const { turn } = await _contract.getUserObject({ userId });
  if (turn > 0) {
    log.info(`[TC] Blockchain user ${ userId } has turn: ${ turn } <<`);
    user.assignTurn(turn);
  } else {
    log.info(`[TC] Blockchain user ${ userId } doesn't have turn assigned <<`);
  }
};

const addToLine = async (userId) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[TC] >> Blockchain requesting turn for user: ${ userId } - (wait)`);
  try {
    const turn = await _contract.addToLine({ args: { userId } });
    log.info(`[TC] Blockchain user ${ userId } got turn: ${ turn } <<`);
    return turn;
  } catch (error) {
    console.error(error);
    return -1;
  }
};

const peek = async () => {
  if (!_contract) throw Error('not connected to near platform');
  log.info(`[TC] >> Blockchain line peek requested - (wait)`);
  const removedUserId = await _contract.peek({ args: {} });
  log.info(`[TC] Blockchain first user in line removed <<`);
  return removedUserId;
};

const rewardGameToken = async (userId, uriMetadata) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[TC] >> Blockchain tokenRewarded event: ${ userId } ${ uriMetadata } - (wait)`);
  const tokenReward = await _contract.rewardGameToken({ args: { userId, uriMetadata }});
  log.info(`[TC] Blockchain tokenRewarded <<`);
  return tokenReward;
};

const rewardPoints = async (userId, points) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[TC] >> Blockchain reward points event: ${ userId } ${ points } - (wait)`);
  const totalPoints = await _contract.rewardPoints({args: { userId, points }});
  log.info(`[TC] Blockchain points rewarded <<`);
  return totalPoints;
};

const setUserOwnership = async (userId, account, secret) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[TC] >> Blockchain set user ${ userId } ownership to address: ${ account } -(wait)`);
  await _contract.setUserOwnership({args: { userId, account, secret }});
  log.info(`[TC] Blockchain user set! <<`);
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
  setUserOwnership,
  encodeKey: (key) => ethers.utils.solidityKeccak256(['string'],[key])
};
