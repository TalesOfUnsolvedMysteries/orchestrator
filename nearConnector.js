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
  log.info(`[Ⓝ] Near Connector - initialization`);
  try {
    await connect();
    connected = true;
    log.info(`[Ⓝ] Near connection successful`);
  } catch(e) {
    log.error('[Ⓝ] error on connection');
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
        'init',
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
        'nft_mint',
      ],
    }
  );
};

const getContract = () => {
  return _contract;
}

const initContract = async () => {
  if (!_contract) throw Error('not connected to near platform');
  log.info(`[Ⓝ] >> Initializating metadata for NFTs - (wait)`);
  await _contract.init({
    args: {
      metadata: {
        spec: 'toum-0.1.0',
        name: 'Unsolved Mysteries - testnet',
        symbol: 'ToUM',
        icon: 'https://js13kgames.com/games/spaceship-wars-13k/__small.jpg',
        base_uri: '',
        reference: 'https://bafybeiejdg3z267rzcpnniirmmi5h3n3ku2fs4f5g6rmjeh2wpdvfcotxq.ipfs.dweb.link/',
        reference_hash: '',
      },
    }
  });
  log.info(`[Ⓝ] >> contract initializated`);
};

const allocateUser = async (sessionID, secretWord) => {
  if (!_contract) throw Error('not connected to near platform');
  log.info(`[Ⓝ] >> Blockchain allocating user for session: ${ sessionID } - (wait)`);
  const encodedKey = ethers.utils.solidityKeccak256(['string'],[secretWord]);
  const userID = await _contract.allocateUser({
    args: {
      uuid: sessionID,
      unlockKey: encodedKey
    }
  });
  log.info(`[Ⓝ] user allocated: ${ userID } <<`);
  return { userID, encodedKey };
};

const syncUser = async (user) => {
  if (!_contract) throw Error('not connected to Near network');
  const userId = user.getUserID();
  log.info(`[Ⓝ] >> Blockchain syncing user: ${ userId } - (wait)`);
  const { turn } = await _contract.getUserObject({ userId });
  if (turn > 0) {
    log.info(`[Ⓝ] Blockchain user ${ userId } has turn: ${ turn } <<`);
    user.assignTurn(turn);
  } else {
    log.info(`[Ⓝ] Blockchain user ${ userId } doesn't have turn assigned <<`);
  }
};

const addToLine = async (userId) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[Ⓝ] >> Blockchain requesting turn for user: ${ userId } - (wait)`);
  try {
    const turn = await _contract.addToLine({ args: { userId } });
    log.info(`[Ⓝ] Blockchain user ${ userId } got turn: ${ turn } <<`);
    return turn;
  } catch (error) {
    console.error(error);
    return -1;
  }
};

const peek = async () => {
  if (!_contract) throw Error('not connected to near platform');
  log.info(`[Ⓝ] >> Blockchain line peek requested - (wait)`);
  const removedUserId = await _contract.peek({ args: {} });
  log.info(`[Ⓝ] Blockchain first user in line removed <<`);
  return removedUserId;
};

const rewardGameToken = async (userId, metadata) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[Ⓝ] >> Blockchain tokenRewarded event: ${ userId } ${ metadata.reference } - (wait)`);
  const tokenRewardId = await _contract.rewardGameToken({ args: { userId, metadata }});
  const user = await _contract.getUserObject({ userId });
  if (user.nearAccount) {
    await _contract.nft_mint({ args: { receiver_id: user.nearAccount, token_id: tokenRewardId.toString(), metadata }});
  }
  log.info(`[Ⓝ] Blockchain tokenRewarded <<`);
  return tokenRewardId;
};

const rewardPoints = async (userId, points) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[Ⓝ] >> Blockchain reward points event: ${ userId } ${ points } - (wait)`);
  const totalPoints = await _contract.rewardPoints({args: { userId, points }});
  log.info(`[Ⓝ] Blockchain points rewarded <<`);
  return totalPoints;
};

const setUserOwnership = async (userId, account, secret) => {
  if (!_contract) throw Error('not connected to Near network');
  log.info(`[Ⓝ] >> Blockchain set user ${ userId } ownership to address: ${ account } -(wait)`);
  await _contract.setUserOwnership({args: { userId, account, secret }});
  log.info(`[Ⓝ] Blockchain user set! <<`);
};

module.exports = {
  init,
  initContract,
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
